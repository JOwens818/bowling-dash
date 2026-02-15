#!/usr/bin/env python3
"""Rebuild bowling scores CSV from bowler PDF history files.

Expected input layout:
  data/
    <Bowler Name>/
      *.pdf
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROW_PATTERN = re.compile(
    r"^\s*(\d+)\s+"
    r"(\d{2}/\d{2}/\d{4})(-?\d+)\s+"
    r"(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+"
    r"(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$"
)

CSV_COLUMNS = [
    "bowler",
    "Season",
    "week",
    "date",
    "game1",
    "game2",
    "game3",
    "scratch_series",
    "handicap",
    "handicap_series",
    "avg_before",
    "avg_after",
    "avg_today",
    "plus_minus_avg",
]


@dataclass(frozen=True)
class ScoreRow:
    bowler: str
    season: str
    week: int
    date: dt.date
    game1: int
    game2: int
    game3: int
    scratch_series: int
    handicap: int
    handicap_series: int
    avg_before: int
    avg_after: int
    avg_today: int
    plus_minus_avg: int

    def to_csv_row(self) -> dict[str, str]:
        return {
            "bowler": self.bowler,
            "Season": self.season,
            "week": str(self.week),
            "date": self.date.isoformat(),
            "game1": str(self.game1),
            "game2": str(self.game2),
            "game3": str(self.game3),
            "scratch_series": str(self.scratch_series),
            "handicap": str(self.handicap),
            "handicap_series": str(self.handicap_series),
            "avg_before": str(self.avg_before),
            "avg_after": str(self.avg_after),
            "avg_today": str(self.avg_today),
            "plus_minus_avg": str(self.plus_minus_avg),
        }


def run_pdftotext(pdf_path: Path) -> str:
    cmd = ["pdftotext", "-layout", str(pdf_path), "-"]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"pdftotext failed for '{pdf_path}': {result.stderr.strip() or 'unknown error'}"
        )
    return result.stdout


def parse_pdf_rows(pdf_path: Path, bowler: str) -> list[ScoreRow]:
    text = run_pdftotext(pdf_path)
    rows: list[ScoreRow] = []
    season = pdf_path.name

    for line in text.splitlines():
        match = ROW_PATTERN.match(line)
        if not match:
            continue

        (
            week,
            date_str,
            game1,
            game2,
            game3,
            scratch_series,
            handicap,
            handicap_series,
            avg_before,
            avg_after,
            avg_today,
            plus_minus_avg,
        ) = match.groups()

        rows.append(
            ScoreRow(
                bowler=bowler,
                season=season,
                week=int(week),
                date=dt.datetime.strptime(date_str, "%m/%d/%Y").date(),
                game1=int(game1),
                game2=int(game2),
                game3=int(game3),
                scratch_series=int(scratch_series),
                handicap=int(handicap),
                handicap_series=int(handicap_series),
                avg_before=int(avg_before),
                avg_after=int(avg_after),
                avg_today=int(avg_today),
                plus_minus_avg=int(plus_minus_avg),
            )
        )

    return rows


def collect_rows(data_dir: Path) -> list[ScoreRow]:
    all_rows: list[ScoreRow] = []

    for bowler_dir in sorted(data_dir.iterdir()):
        if not bowler_dir.is_dir():
            continue

        bowler = bowler_dir.name
        pdfs = sorted(bowler_dir.glob("*.pdf"))
        for pdf_path in pdfs:
            all_rows.extend(parse_pdf_rows(pdf_path, bowler))

    # Some source files can overlap; keep unique rows by bowler+date+week.
    deduped: dict[tuple[str, dt.date, int], ScoreRow] = {}
    for row in all_rows:
        deduped[(row.bowler, row.date, row.week)] = row

    # Oldest to newest for easier charting.
    return sorted(
        deduped.values(),
        key=lambda r: (r.date, r.bowler.lower(), r.week),
    )


def write_csv(rows: list[ScoreRow], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.to_csv_row())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rebuild bowling CSV from per-bowler PDF folders."
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="Root folder containing one subfolder per bowler (default: data).",
    )
    parser.add_argument(
        "--output",
        default="data/processed/team_scores.csv",
        help="Output CSV path to fully rebuild (default: data/processed/team_scores.csv).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_dir = Path(args.data_dir)
    output_path = Path(args.output)

    if not data_dir.exists() or not data_dir.is_dir():
        print(f"Data directory not found: {data_dir}", file=sys.stderr)
        return 1

    try:
        rows = collect_rows(data_dir)
        write_csv(rows, output_path)
    except Exception as exc:
        print(f"Failed to rebuild CSV: {exc}", file=sys.stderr)
        return 1

    print(f"Wrote {len(rows)} rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
