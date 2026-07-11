#!/bin/bash
# 從 FinMind 下載 TX 期貨資料並更新 js/data.js
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$DIR/data/tx_raw.json"
CONT="$DIR/data/tx_continuous.json"
OUT="$DIR/js/data.js"

echo "下載 TX 期貨資料..."
curl -s "https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesDaily&data_id=TX&start_date=1998-07-21" -o "$RAW"

echo "處理近月連續契約..."
jq '[.data | group_by(.date) | .[] | sort_by(.contract_date) | .[0] | {date, close: (if (.settlement_price > 0) then .settlement_price else .close end), volume, contract: .contract_date}] | [.[] | select(.close > 0)] | sort_by(.date)' "$RAW" > "$CONT"

echo "產生 js/data.js..."
echo 'export const TX_DATA = ' > "$OUT"
cat "$CONT" >> "$OUT"
echo ';' >> "$OUT"

echo "完成！共 $(jq length "$CONT") 筆資料"
