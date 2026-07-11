# 台股期貨三十年回測

台指期貨（TX 大台）自 1998 年上市以來的績效回測網頁，並試算不爆倉所需保證金。

## 功能

- 近 30 年台指期近月連續契約日資料回測
- 多種策略：買進持有、賣出持有、均線交叉、趨勢跟隨
- 保證金模擬：原始 / 維持保證金、爆倉日期、最低不爆倉資金
- 圖表：權益曲線、回撤、指數走勢

## 線上試用（GitHub Pages）

部署完成後，網址格式為：

```
https://<你的帳號>.github.io/taiwan-futures-backtest/
```

## 本機開發

因使用 ES Module，需透過本機 HTTP 伺服器開啟：

```bash
cd ~/Projects/taiwan-futures-backtest
python3 -m http.server 8080
```

瀏覽器開啟：http://localhost:8080

## 部署到 GitHub Pages

### 第一次上傳

1. 到 [github.com/new](https://github.com/new) 建立新 repo，名稱建議 `taiwan-futures-backtest`（Public）
2. **不要**勾選 README / .gitignore（專案已有）
3. 在本機執行：

```bash
cd ~/Projects/taiwan-futures-backtest
git init
git add .
git commit -m "Initial commit: Taiwan futures backtest dashboard"
git branch -M main
git remote add origin https://github.com/<你的帳號>/taiwan-futures-backtest.git
git push -u origin main
```

### 啟用 GitHub Pages

1. 進 repo → **Settings** → **Pages**
2. **Build and deployment** → Source 選 **GitHub Actions**
3. push 到 `main` 後，Actions 會自動部署（約 1–2 分鐘）
4. 部署完成後，Pages 設定頁會顯示公開網址

之後每次 `git push` 都會自動更新線上版本。

## 資料

- 來源：[FinMind](https://finmindtrade.com/) `TaiwanFuturesDaily` TX
- 處理：每日取最近到期月份契約組成連續序列
- 更新：可重新執行 `scripts/fetch_data.sh` 下載最新資料

## 保證金說明

大台每點 200 元。台期所原始保證金 ≈ 結算保證金 × 1.35，維持保證金 ≈ 結算保證金 × 1.035。本工具以契約價值百分比（預設 14.5%）估算，可於介面調整。
