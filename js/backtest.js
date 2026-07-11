import { TX_MULTIPLIER } from "./margin.js";

/**
 * 計算簡單移動平均
 */
function sma(values, period) {
  const result = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result[i] = sum / period;
  }
  return result;
}

/**
 * 策略定義
 */
export const STRATEGIES = {
  long: {
    id: "long",
    name: "買進持有（做多）",
    description: "從第一天起持有 1 口大台多單至結束",
    generateSignals(closes) {
      return closes.map(() => 1);
    },
  },
  short: {
    id: "short",
    name: "賣出持有（做空）",
    description: "從第一天起持有 1 口大台空單至結束",
    generateSignals(closes) {
      return closes.map(() => -1);
    },
  },
  ma_cross: {
    id: "ma_cross",
    name: "均線交叉（20/60）",
    description: "短均線上穿長均線做多，下穿做空",
    generateSignals(closes) {
      const fast = sma(closes, 20);
      const slow = sma(closes, 60);
      const signals = new Array(closes.length).fill(0);
      for (let i = 60; i < closes.length; i++) {
        if (fast[i] > slow[i]) signals[i] = 1;
        else if (fast[i] < slow[i]) signals[i] = -1;
        else signals[i] = signals[i - 1];
      }
      return signals;
    },
  },
  ma_trend: {
    id: "ma_trend",
    name: "趨勢跟隨（120日均線）",
    description: "價格在 120 日均線之上做多，之下空手",
    generateSignals(closes) {
      const trend = sma(closes, 120);
      return closes.map((c, i) => (trend[i] != null && c > trend[i] ? 1 : 0));
    },
  },
};

/**
 * 執行回測
 * @param {Array} data - [{date, close}]
 * @param {string} strategyId
 * @param {number} contracts - 口數（正=策略方向，實際方向由 signal 決定）
 */
export function runBacktest(data, strategyId, contracts = 1) {
  const closes = data.map((d) => d.close);
  const dates = data.map((d) => d.date);
  const strategy = STRATEGIES[strategyId] || STRATEGIES.long;
  const signals = strategy.generateSignals(closes);

  const dailyPnl = [];
  const positions = [];
  const priceChanges = [];

  for (let i = 1; i < data.length; i++) {
    const position = signals[i - 1] * contracts;
    const priceChange = closes[i] - closes[i - 1];
    const pnl = priceChange * TX_MULTIPLIER * position;
    dailyPnl.push(pnl);
    positions.push(position);
    priceChanges.push(priceChange);
  }

  // 績效統計
  const totalPnl = dailyPnl.reduce((a, b) => a + b, 0);
  const tradingDays = dailyPnl.length;
  const years = tradingDays / 252;

  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  const equityCurve = [];

  for (const pnl of dailyPnl) {
    cumulative += pnl;
    equityCurve.push(cumulative);
    if (cumulative > peak) peak = cumulative;
    const dd = peak > 0 ? (peak - cumulative) / Math.abs(peak) : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const winDays = dailyPnl.filter((p) => p > 0).length;
  const winRate = winDays / tradingDays;

  // 年化報酬（以每口損益相對於平均契約價值）
  const avgNotional = closes.reduce((a, c) => a + c * TX_MULTIPLIER, 0) / closes.length;
  const cagr = years > 0 ? Math.pow(1 + totalPnl / avgNotional, 1 / years) - 1 : 0;

  // 最大單日虧損
  const maxDailyLoss = Math.min(...dailyPnl);
  const maxDailyGain = Math.max(...dailyPnl);

  // 連續虧損
  let maxLosingStreak = 0;
  let streak = 0;
  for (const pnl of dailyPnl) {
    if (pnl < 0) {
      streak++;
      if (streak > maxLosingStreak) maxLosingStreak = streak;
    } else {
      streak = 0;
    }
  }

  return {
    dates: dates.slice(1),
    closes: closes.slice(1),
    dailyPnl,
    positions,
    equityCurve,
    totalPnl,
    tradingDays,
    years,
    maxDrawdown,
    winRate,
    cagr,
    maxDailyLoss,
    maxDailyGain,
    maxLosingStreak,
    strategy,
    avgNotional,
  };
}
