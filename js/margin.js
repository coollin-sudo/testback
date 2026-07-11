/** 台指期貨 (TX) 保證金計算模組 */

export const TX_MULTIPLIER = 200; // 每點 200 元
export const INITIAL_MARGIN_RATIO = 1.35; // 原始保證金 / 結算保證金
export const MAINTENANCE_MARGIN_RATIO = 1.035; // 維持保證金 / 結算保證金
export const MAINTENANCE_TO_INITIAL = MAINTENANCE_MARGIN_RATIO / INITIAL_MARGIN_RATIO; // ≈ 0.767

/**
 * 依指數點位估算保證金（TAIFEX 動態調整，此處用合約價值百分比近似）
 * @param {number} indexPrice - 加權指數點位
 * @param {number} contracts - 口數
 * @param {number} initialRate - 原始保證金率（佔契約價值）
 */
export function calcMargins(indexPrice, contracts, initialRate = 0.145) {
  const notional = indexPrice * TX_MULTIPLIER * contracts;
  const initial = Math.ceil(notional * initialRate / 1000) * 1000;
  const maintenance = Math.ceil(initial * MAINTENANCE_TO_INITIAL / 1000) * 1000;
  return { notional, initial, maintenance };
}

/**
 * 計算帳戶權益
 */
export function calcEquity(capital, cumulativePnl, unrealizedPnl = 0) {
  return capital + cumulativePnl + unrealizedPnl;
}

/**
 * 模擬每日權益與保證金狀態
 */
export function simulateMarginPath(dailyPnl, prices, contracts, capital, initialRate) {
  let cumulativePnl = 0;
  let peakEquity = capital;
  let maxDrawdown = 0;
  let marginCalls = [];
  let liquidated = false;
  let liquidationDate = null;

  const equitySeries = [];
  const maintenanceSeries = [];
  const initialMarginSeries = [];

  for (let i = 0; i < dailyPnl.length; i++) {
    cumulativePnl += dailyPnl[i];
    const price = prices[i];
    const { initial, maintenance } = calcMargins(price, Math.abs(contracts), initialRate);
    const equity = calcEquity(capital, cumulativePnl);

    equitySeries.push(equity);
    maintenanceSeries.push(maintenance);
    initialMarginSeries.push(initial);

    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    if (!liquidated && equity < maintenance) {
      marginCalls.push({
        date: i,
        equity,
        maintenance,
        shortfall: maintenance - equity,
      });
      liquidated = true;
      liquidationDate = i;
    }
  }

  return {
    equitySeries,
    maintenanceSeries,
    initialMarginSeries,
    maxDrawdown,
    marginCalls,
    liquidated,
    liquidationDate,
    finalEquity: equitySeries[equitySeries.length - 1],
    totalPnl: cumulativePnl,
  };
}

/**
 * 二分搜尋：找出不爆倉的最低起始資金
 */
export function findMinimumCapital(dailyPnl, prices, contracts, initialRate) {
  let lo = 0;
  let hi = 50_000_000; // 上限 5000 萬

  // 先找到一個足夠高的上限
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const result = simulateMarginPath(dailyPnl, prices, contracts, mid, initialRate);
    if (result.liquidated) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const minCapital = lo;
  const atMin = simulateMarginPath(dailyPnl, prices, contracts, minCapital, initialRate);
  const startPrice = prices[0];
  const startMargins = calcMargins(startPrice, Math.abs(contracts), initialRate);

  // 建議額外緩衝：最大回撤金額 + 一個月維持保證金
  let worstEquity = minCapital;
  let cumulativePnl = 0;
  for (const pnl of dailyPnl) {
    cumulativePnl += pnl;
    const eq = minCapital + cumulativePnl;
    if (eq < worstEquity) worstEquity = eq;
  }

  const maxDdAmount = minCapital - worstEquity;
  const recommendedBuffer = Math.ceil(maxDdAmount * 0.1 / 10000) * 10000; // 10% 緩衝
  const recommended = minCapital + Math.max(recommendedBuffer, startMargins.maintenance);

  return {
    minimum: minCapital,
    recommended,
    startMargins,
    simulation: atMin,
    maxDdAmount,
  };
}

/**
 * 格式化台幣
 */
export function formatTWD(n) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n, digits = 2) {
  if (n == null || isNaN(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}
