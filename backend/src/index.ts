import express from 'express';
import axios from 'axios';
import cors from 'cors';
import bodyParser from 'body-parser';
// @ts-ignore
import low from 'lowdb';
// @ts-ignore
import FileSync from 'lowdb/adapters/FileSync';
import path from 'path';
import iconv from 'iconv-lite';

interface Stock {
  code: string;
  name: string;
}

interface Schema {
  stocks: Stock[];
}

const adapter = new FileSync(path.join(__dirname, '../db.json'));
const db = low(adapter);

// 初始化数据库
db.defaults({ stocks: [] }).write();

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

// 获取自选股列表
app.get('/api/stocks', (req, res) => {
  const stocks = db.get('stocks').value();
  res.json(stocks);
});

// 格式化股票代码
function formatCode(code: string) {
  if (code.startsWith('6')) {
    return 'sh' + code;
  } else if (code.startsWith('0') || code.startsWith('3')) {
    return 'sz' + code;
  }
  return code;
}

// 获取单只股票详情 (从腾讯接口获取)
async function fetchStockInfo(code: string) {
  const fullCode = formatCode(code);
  
  try {
    const response = await axios.get(`http://qt.gtimg.cn/q=${fullCode}`, {
      responseType: 'arraybuffer'
    });
    const data = iconv.decode(Buffer.from(response.data), 'gbk');
    const parts = data.split('~');
    if (parts.length < 2) return null;
    
    return {
      name: parts[1],
      price: parts[3],
      changePercent: parts[32],
      turnoverRate: parts[38], // 换手率
      amount: parts[37], // 成交额 (万元)
    };
  } catch (error) {
    console.error(`Error fetching stock ${code}:`, error);
    return null;
  }
}

// 批量获取股票详情
async function fetchStocksInfo(codes: string[]) {
  if (codes.length === 0) return [];
  
  const fullCodes = codes.map(formatCode).join(',');
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(`http://qt.gtimg.cn/q=${fullCodes}`, {
        responseType: 'arraybuffer',
        timeout: 5000 // 设置 5s 超时
      });
      const data = iconv.decode(Buffer.from(response.data), 'gbk');
      const lines = data.split('\n').filter(line => line.trim());
      
      const results = lines.map(line => {
        const parts = line.split('~');
        if (parts.length < 2) return null;
        return {
          code: parts[2],
          name: parts[1],
          price: parts[3],
          changePercent: parts[32],
          turnoverRate: parts[38],
          amount: parts[37],
        };
      }).filter(Boolean);

      if (results.length > 0) return results;
      throw new Error('Empty results from API');
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error instanceof Error ? error.message : error);
      if (attempt === maxRetries) break;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return [];
}

// 添加自选股
app.post('/api/stocks', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const exists = db.get('stocks').find({ code }).value();
  if (exists) return res.status(400).json({ error: 'Stock already exists' });

  const info = await fetchStockInfo(code);
  if (!info) return res.status(400).json({ error: 'Invalid stock code or fetch failed' });

  const newStock: Stock = { code, name: info.name };
  db.get('stocks').push(newStock).write();
  res.json(newStock);
});

// 删除自选股
app.delete('/api/stocks/:code', (req, res) => {
  const { code } = req.params;
  db.get('stocks').remove({ code }).write();
  res.json({ success: true });
});

// 语音播报接口
app.get('/api/voice-report', async (req, res) => {
  const stocks = db.get('stocks').value() as Stock[];
  if (!stocks || stocks.length === 0) {
    return res.send('您当前还没有添加自选股。');
  }

  const stockInfos = await fetchStocksInfo(stocks.map(s => s.code));
  
  const reports = stocks.map(stock => {
    const info = stockInfos.find(i => i && i.code === stock.code);
    if (!info) return `${stock.name}数据获取失败。`;
    return `${stock.name}，当前价格${info.price}元，换手率${info.turnoverRate}百分比，成交额${info.amount}万元。`;
  });

  const result = `您好，当前自选股行情如下：${reports.join(' ')}`;
  res.send(result);
});

// 排序自选股
app.put('/api/stocks/sort', (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes)) return res.status(400).json({ error: 'Invalid data' });

  const currentStocks = db.get('stocks').value() as Stock[];
  const sortedStocks = codes.map(code => currentStocks.find((s: Stock) => s.code === code)).filter(Boolean) as Stock[];
  
  db.set('stocks', sortedStocks).write();
  res.json(sortedStocks);
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
