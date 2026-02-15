# Bowling Dash

A lightweight dashboard for bowling stats, powered by a CSV generated from bowler PDF history reports.

## What This App Does

- Reads bowling data from `data/processed/team_scores.csv`
- Renders two pages:
  - `Bowler`: individual bowler dashboard
  - `Team`: team-level dashboard
- Uses a simple static frontend (React + Vite), no backend required

## Data Flow

1. Put PDF reports under `data/<Bowler Name>/*.pdf`
2. Rebuild the CSV from all PDFs
3. Run the frontend and view charts

## Rebuild CSV (ETL)

Run:

```bash
python3 scripts/extract_scores.py
```

Default output:

- `data/processed/team_scores.csv`

The script fully rebuilds the CSV each run.

## Run the App

Install dependencies:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

## CSV Schema

Current columns:

- `bowler`
- `Season`
- `week`
- `date`
- `game1`
- `game2`
- `game3`
- `scratch_series`
- `handicap`
- `handicap_series`
- `avg_before`
- `avg_after`
- `avg_today`
- `plus_minus_avg`

## Notes

- Team and Bowler views both support season filtering.
- Some metrics exclude blind weeks (`scratch_series = 0`) where appropriate.
