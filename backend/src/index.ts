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
  holdings?: number; // 持股数
  costPrice?: number; // 成本价
  groupId?: string; // 分组ID
}

interface Group {
  id: string;
  name: string;
}

interface Schema {
  stocks: Stock[];
  groups: Group[];
}

const adapter = new FileSync(path.join(__dirname, '../db.json'));
const db = low(adapter);

// 初始化数据库
db.defaults({ stocks: [], groups: [] }).write();

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

// 获取分组列表
app.get('/api/groups', (req, res) => {
  const groups = (db.get('groups') as any).value();
  res.json(groups);
});

// 添加分组
app.post('/api/groups', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = Date.now().toString();
  const newGroup: Group = { id, name };
  (db.get('groups') as any).push(newGroup).write();
  res.json(newGroup);
});

// 更新分组名称
app.put('/api/groups/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const group = (db.get('groups') as any).find({ id });
  if (!group.value()) return res.status(404).json({ error: 'Group not found' });

  group.assign({ name }).write();
  res.json(group.value());
});

// 删除分组
app.delete('/api/groups/:id', (req, res) => {
  const { id } = req.params;
  
  // 删除分组
  (db.get('groups') as any).remove({ id }).write();
  
  // 将该分组下的所有股票的 groupId 置空
  const stocks = (db.get('stocks') as any).value() as Stock[];
  stocks.forEach((stock: Stock) => {
    if (stock.groupId === id) {
      (db.get('stocks') as any).find({ code: stock.code }).assign({ groupId: undefined }).write();
    }
  });

  res.json({ success: true });
});

// 获取自选股列表
app.get('/api/stocks', (req, res) => {
  const stocks = (db.get('stocks') as any).value();
  res.json(stocks);
});

// 格式化股票代码
function formatCode(code: string) {
  if (code.startsWith('6') || code.startsWith('5')) {
    return 'sh' + code;
  } else if (code.startsWith('0') || code.startsWith('3') || code.startsWith('1')) {
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
      changeValue: parts[31], // 涨跌额
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
          changeValue: parts[31], // 涨跌额
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
  const { code, holdings, costPrice, groupId } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const exists = (db.get('stocks') as any).find({ code }).value();
  if (exists) return res.status(400).json({ error: 'Stock already exists' });

  const info = await fetchStockInfo(code);
  if (!info) return res.status(400).json({ error: 'Invalid stock code or fetch failed' });

  const newStock: Stock = { 
    code, 
    name: info.name,
    holdings: holdings ? Number(holdings) : 0,
    costPrice: costPrice ? Number(costPrice) : 0,
    groupId: groupId || undefined
  };
  (db.get('stocks') as any).push(newStock).write();
  res.json(newStock);
});

// 排序自选股
app.put('/api/stocks/sort', (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes)) return res.status(400).json({ error: 'Invalid data' });

  const currentStocks = (db.get('stocks') as any).value() as Stock[];
  // 只排序在 codes 里的股票，其他股票保持在后面或原位
  const sortedStocks = codes.map(code => currentStocks.find((s: Stock) => s.code === code)).filter(Boolean) as Stock[];
  const remainingStocks = currentStocks.filter(s => !codes.includes(s.code));
  
  const newStocks = [...sortedStocks, ...remainingStocks];
  
  db.set('stocks', newStocks).write();
  res.json(newStocks);
});

// 更新自选股详情
app.put('/api/stocks/:code', (req, res) => {
  const { code } = req.params;
  const { holdings, costPrice, groupId } = req.body;
  
  const stock = (db.get('stocks') as any).find({ code });
  if (!stock.value()) return res.status(404).json({ error: 'Stock not found' });

  const updateData: any = {};
  if (holdings !== undefined) updateData.holdings = Number(holdings);
  if (costPrice !== undefined) updateData.costPrice = Number(costPrice);
  if (groupId !== undefined) updateData.groupId = groupId === '' ? undefined : groupId;

  stock.assign(updateData).write();
   res.json(stock.value());
 });
 
 // 交易接口 (买入/卖出)
 app.post('/api/stocks/:code/trade', (req, res) => {
   const { code } = req.params;
   const { type, quantity, price } = req.body; // type: 'buy' | 'sell'
 
   const stock = (db.get('stocks') as any).find({ code });
   const currentStock = stock.value();
   if (!currentStock) return res.status(404).json({ error: 'Stock not found' });
 
   const qty = Number(quantity);
   const p = Number(price);
   let newHoldings = currentStock.holdings || 0;
   let newCostPrice = currentStock.costPrice || 0;
 
   if (type === 'buy') {
     // 买入：摊薄成本
     // 新成本 = (旧持仓 * 旧成本 + 买入持仓 * 买入价格) / (旧持仓 + 买入持仓)
     const totalCost = (newHoldings * newCostPrice) + (qty * p);
     newHoldings += qty;
     newCostPrice = newHoldings > 0 ? totalCost / newHoldings : 0;
   } else if (type === 'sell') {
     // 卖出：持仓减少，成本不变（简单逻辑）
     if (qty > newHoldings) return res.status(400).json({ error: 'Insufficient holdings' });
     newHoldings -= qty;
     if (newHoldings === 0) newCostPrice = 0;
   } else {
     return res.status(400).json({ error: 'Invalid trade type' });
   }
 
   stock.assign({ holdings: newHoldings, costPrice: Number(newCostPrice.toFixed(4)) }).write();
   res.json(stock.value());
 });
 
 // 删除自选股
app.delete('/api/stocks/:code', (req, res) => {
  const { code } = req.params;
  (db.get('stocks') as any).remove({ code }).write();
  res.json({ success: true });
});

// 语音播报内容生成函数
async function getVoiceReportContent(groupId?: string) {
  let stocks = (db.get('stocks') as any).value() as Stock[];
  
  if (groupId) {
    stocks = stocks.filter(s => s.groupId === groupId);
  }

  if (!stocks || stocks.length === 0) {
    return '您当前还没有添加自选股。';
  }

  const stockInfos = await fetchStocksInfo(stocks.map(s => s.code));
  
  const reports = stocks.map(stock => {
    const info = stockInfos.find(i => i && i.code === stock.code);
    if (!info) return `${stock.name}数据获取失败。`;
    const changeText = parseFloat(info.changeValue) >= 0 ? `上涨${info.changeValue}` : `下跌${Math.abs(parseFloat(info.changeValue))}`;
    let report = `${stock.name}，当前价格 ${info.price} ，${changeText}元，换手率百分之${info.turnoverRate}。`;
    
    if (stock.holdings && stock.holdings > 0) {
      const dailyProfit = (parseFloat(info.changeValue) * stock.holdings).toFixed(2);
      const dailyProfitText = parseFloat(dailyProfit) >= 0 ? `盈利${dailyProfit}` : `亏损${Math.abs(parseFloat(dailyProfit))}`;
      report += ` 今日${dailyProfitText}元。`;
      
      if (stock.costPrice && stock.costPrice > 0) {
        const totalProfit = ((parseFloat(info.price) - stock.costPrice) * stock.holdings).toFixed(2);
        const totalProfitText = parseFloat(totalProfit) >= 0 ? `累计盈利${totalProfit}` : `累计亏损${Math.abs(parseFloat(totalProfit))}`;
        report += ` ${totalProfitText}元。`;
      }
    }
    return report;
  });

  return `您好，当前自选股行情如下：${reports.join(' ')}`;
}

// 语音播报接口
app.get('/api/voice-report', async (req, res) => {
  const { groupId } = req.query;
  const result = await getVoiceReportContent(groupId as string);
  res.send(result);
});

// 天猫精灵技能对接接口
app.post('/', async (req, res) => {
  const result = await getVoiceReportContent();
  
  // 返回符合天猫精灵协议的响应
  res.json({
    returnCode: '0',
    returnValue: {
      reply: result,
      resultType: 'RESULT',
      executeCode: 'SUCCESS',
      msgInfo: '成功'
    }
  });
});

// 天猫精灵技能验证接口
app.get('/aligenie/90f1d72a6fa3d2a9b5dfaf1959a5516e.txt', (req, res) => {
  res.send('Jfc4Z4Ur15JwUBuvUQD5wg7Nu8+l+HscqYlfofbyJdZwb1kCtdquRqaQwQ3aNlrr');
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
