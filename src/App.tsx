import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

type AppRoute = "bowler" | "team";

type ScoreRow = {
  bowler: string;
  season: string;
  week: number;
  date: string;
  game1: number;
  game2: number;
  game3: number;
  scratch_series: number;
  handicap: number;
  handicap_series: number;
  avg_before: number;
  avg_after: number;
  avg_today: number;
  plus_minus_avg: number;
};

const NUMBER_FIELDS: (keyof Omit<ScoreRow, "bowler" | "season" | "date">)[] = [
  "week",
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
];

function parseNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(raw: Record<string, unknown>): ScoreRow {
  const row = {
    bowler: String(raw.bowler ?? ""),
    season: String(raw.Season ?? raw.season ?? ""),
    date: String(raw.date ?? ""),
  } as ScoreRow;

  for (const field of NUMBER_FIELDS) {
    row[field] = parseNumber(raw[field]);
  }
  return row;
}

function formatShortDate(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseDateString(dateString: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(year, month - 1, day);
  }
  return new Date(dateString);
}

function getWeekKey(row: ScoreRow): string {
  return `${row.date}-${row.week}`;
}

function getRouteFromHash(hash: string): AppRoute {
  return hash === "#/team" ? "team" : "bowler";
}

function Sparkline({ values }: { values: number[] }) {
  const width = 80;
  const height = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / spread) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke="#60a5fa"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function BowlingIcon() {
  return (
    <svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true">
      <defs>
        <linearGradient id="ballGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="28" r="12" fill="url(#ballGradient)" />
      <circle cx="12" cy="24" r="1.8" fill="#0b1220" />
      <circle cx="16" cy="21" r="1.8" fill="#0b1220" />
      <circle cx="20" cy="24" r="1.8" fill="#0b1220" />
      <path
        d="M32 8c3.8 0 6.5 2.8 6.5 6.6V36c0 3.1-2.1 5.5-5.2 6h-2.6c-3.1-.5-5.2-2.9-5.2-6V14.6C25.5 10.8 28.2 8 32 8z"
        fill="#f8fafc"
      />
      <circle cx="31" cy="14.3" r="1.1" fill="#94a3b8" />
      <circle cx="33.5" cy="14.3" r="1.1" fill="#94a3b8" />
      <circle cx="32.3" cy="16.3" r="1.1" fill="#94a3b8" />
    </svg>
  );
}

function TeamPage() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [selectedTeamWeekIndex, setSelectedTeamWeekIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Papa.parse<Record<string, unknown>>("/team_scores.csv", {
      header: true,
      download: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!active) return;
        const parsed = result.data
          .map(normalizeRow)
          .filter((r) => r.bowler && r.date)
          .sort((a, b) => +parseDateString(a.date) - +parseDateString(b.date));
        setRows(parsed);
        setLoading(false);
      },
      error: (err) => {
        if (!active) return;
        setError(`Failed to load CSV: ${err.message}`);
        setLoading(false);
      },
    });

    return () => {
      active = false;
    };
  }, []);

  const seasons = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.season)))
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
  }, [rows]);

  useEffect(() => {
    if (seasons.length === 0) {
      if (selectedSeason !== "") setSelectedSeason("");
      return;
    }
    if (!selectedSeason || !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  const activeRows = useMemo(
    () => (selectedSeason ? rows.filter((row) => row.season === selectedSeason) : []),
    [rows, selectedSeason]
  );

  const playedRows = useMemo(
    () => activeRows.filter((row) => row.scratch_series > 0),
    [activeRows]
  );

  const teamBestGame = useMemo(() => {
    if (playedRows.length === 0) return 0;

    const weeklyGameTotals = new Map<
      string,
      { game1: number; game2: number; game3: number }
    >();

    for (const row of playedRows) {
      const key = `${row.season}|${row.date}|${row.week}`;
      const totals = weeklyGameTotals.get(key) ?? { game1: 0, game2: 0, game3: 0 };
      totals.game1 += row.game1;
      totals.game2 += row.game2;
      totals.game3 += row.game3;
      weeklyGameTotals.set(key, totals);
    }

    let best = 0;
    for (const totals of weeklyGameTotals.values()) {
      best = Math.max(best, totals.game1, totals.game2, totals.game3);
    }
    return best;
  }, [playedRows]);

  const teamBestSeries = useMemo(() => {
    if (playedRows.length === 0) return 0;

    const weeklySeriesTotals = new Map<string, number>();
    for (const row of playedRows) {
      const key = `${row.season}|${row.date}|${row.week}`;
      weeklySeriesTotals.set(key, (weeklySeriesTotals.get(key) ?? 0) + row.scratch_series);
    }

    let best = 0;
    for (const total of weeklySeriesTotals.values()) {
      best = Math.max(best, total);
    }
    return best;
  }, [playedRows]);
  const teamHighHandicapGame = useMemo(() => {
    if (playedRows.length === 0) return 0;

    const weeklyGameTotals = new Map<
      string,
      { game1: number; game2: number; game3: number }
    >();

    for (const row of playedRows) {
      const key = `${row.season}|${row.date}|${row.week}`;
      const totals = weeklyGameTotals.get(key) ?? { game1: 0, game2: 0, game3: 0 };
      totals.game1 += row.game1 + row.handicap;
      totals.game2 += row.game2 + row.handicap;
      totals.game3 += row.game3 + row.handicap;
      weeklyGameTotals.set(key, totals);
    }

    let best = 0;
    for (const totals of weeklyGameTotals.values()) {
      best = Math.max(best, totals.game1, totals.game2, totals.game3);
    }
    return best;
  }, [playedRows]);
  const teamHighHandicapSeries = useMemo(() => {
    if (playedRows.length === 0) return 0;

    const weeklySeriesTotals = new Map<string, number>();
    for (const row of playedRows) {
      const key = `${row.season}|${row.date}|${row.week}`;
      weeklySeriesTotals.set(key, (weeklySeriesTotals.get(key) ?? 0) + row.handicap_series);
    }

    let best = 0;
    for (const total of weeklySeriesTotals.values()) {
      best = Math.max(best, total);
    }
    return best;
  }, [playedRows]);

  const teamSeasonDelta = useMemo(
    () => playedRows.reduce((sum, row) => sum + row.plus_minus_avg, 0),
    [playedRows]
  );

  const pinsByBowler = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of playedRows) {
      totals.set(
        row.bowler,
        (totals.get(row.bowler) ?? 0) + row.game1 + row.game2 + row.game3
      );
    }
    return Array.from(totals.entries())
      .map(([bowler, pins]) => ({ bowler, pins }))
      .sort((a, b) => b.pins - a.pins);
  }, [playedRows]);

  const teamTrendData = useMemo(() => {
    const weekMap = new Map<
      string,
      { week: number; date: string; scratch_series: number; games_bowled: number }
    >();

    for (const row of activeRows) {
      const key = `${row.season}|${row.date}|${row.week}`;
      const existing =
        weekMap.get(key) ?? { week: row.week, date: row.date, scratch_series: 0, games_bowled: 0 };
      existing.scratch_series += row.scratch_series;
      if (row.scratch_series > 0) {
        existing.games_bowled += 3;
      }
      weekMap.set(key, existing);
    }

    const sorted = Array.from(weekMap.values()).sort(
      (a, b) => +parseDateString(a.date) - +parseDateString(b.date)
    );

    return sorted.map((week) => {
      return {
        ...week,
        weekly_avg: Math.round(week.scratch_series / 3),
      };
    });
  }, [activeRows]);

  const teamCurrentAverage = useMemo(() => {
    if (teamTrendData.length === 0) return 0;
    return teamTrendData[teamTrendData.length - 1].weekly_avg;
  }, [teamTrendData]);

  const teamWeeklyRows = useMemo(() => {
    const weekMap = new Map<
      string,
      { week: number; date: string; game1: number; game2: number; game3: number; scratch_series: number; plus_minus_avg: number }
    >();

    for (const row of activeRows) {
      const key = `${row.season}|${row.date}|${row.week}`;
      const existing =
        weekMap.get(key) ??
        {
          week: row.week,
          date: row.date,
          game1: 0,
          game2: 0,
          game3: 0,
          scratch_series: 0,
          plus_minus_avg: 0,
        };
      existing.game1 += row.game1;
      existing.game2 += row.game2;
      existing.game3 += row.game3;
      existing.scratch_series += row.scratch_series;
      existing.plus_minus_avg += row.plus_minus_avg;
      weekMap.set(key, existing);
    }

    return Array.from(weekMap.values()).sort(
      (a, b) => +parseDateString(a.date) - +parseDateString(b.date)
    );
  }, [activeRows]);

  useEffect(() => {
    if (teamWeeklyRows.length === 0) {
      setSelectedTeamWeekIndex(0);
      return;
    }
    setSelectedTeamWeekIndex(teamWeeklyRows.length - 1);
  }, [teamWeeklyRows]);

  if (loading) return <section className="panel">Loading team dashboard...</section>;
  if (error) return <section className="panel">{error}</section>;
  if (rows.length === 0) return <section className="panel">No team data found.</section>;

  return (
    <>
      <header className="hero">
        <div>
          <h1>Team</h1>
        </div>
        <div className="filters">
          <label className="bowler-picker">
            Season
            <select
              value={selectedSeason || seasons[0] || ""}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              {seasons.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {activeRows.length === 0 ? (
        <section className="panel empty-state">No data for this team/season filter.</section>
      ) : (
        <>
          <section className="top-grid">
            <article className="panel summary-tile">
              <h3>Season Snapshot</h3>
              <div className="summary-grid team-summary-grid">
                <div className="mini-stat">
                  <p>Current Avg</p>
                  <h2>{teamCurrentAverage}</h2>
                </div>
                <div className="mini-stat">
                  <p>Season +/-</p>
                  <h2 className={teamSeasonDelta >= 0 ? "good" : "bad"}>
                    {teamSeasonDelta >= 0 ? `+${teamSeasonDelta}` : teamSeasonDelta}
                  </h2>
                </div>
                <div className="mini-stat">
                  <p>Best Game</p>
                  <h2>{teamBestGame}</h2>
                </div>
                <div className="mini-stat">
                  <p>Best Series</p>
                  <h2>{teamBestSeries}</h2>
                </div>
                <div className="mini-stat">
                  <p>High HCP Game</p>
                  <h2>{teamHighHandicapGame}</h2>
                </div>
                <div className="mini-stat">
                  <p>High HCP Series</p>
                  <h2>{teamHighHandicapSeries}</h2>
                </div>
              </div>
            </article>

            <article className="panel">
              <h3>Total Pins by Bowler</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pinsByBowler}
                    dataKey="pins"
                    nameKey="bowler"
                    cx="50%"
                    cy="52%"
                    outerRadius={112}
                    label={({ bowler }) => bowler}
                  >
                    {pinsByBowler.map((entry, index) => {
                      const colors = [
                        "#38bdf8",
                        "#22c55e",
                        "#f59e0b",
                        "#f97316",
                        "#818cf8",
                        "#ef4444",
                        "#14b8a6",
                      ];
                      return (
                        <Cell
                          key={`pins-${entry.bowler}`}
                          fill={colors[index % colors.length]}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [value, "Total Pins"]}
                    contentStyle={{ background: "#11151b", border: "1px solid #27303d" }}
                    labelStyle={{ color: "#e8edf7" }}
                    itemStyle={{ color: "#e8edf7" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </article>
          </section>

          <section className="chart-grid">
            <article className="panel wide">
              <h3>Average + Scratch Series Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={teamTrendData}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke="#2a2f38" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} stroke="#98a1b3" />
                  <YAxis yAxisId="left" stroke="#4fd1c5" width={56} />
                  <YAxis yAxisId="right" orientation="right" stroke="#fbbf24" width={56} />
                  <Tooltip
                    labelFormatter={(v) => formatShortDate(String(v))}
                    contentStyle={{ background: "#11151b", border: "1px solid #27303d" }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="right"
                    dataKey="scratch_series"
                    fill="#f59e0b"
                    name="Scratch Series"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="weekly_avg"
                    stroke="#2dd4bf"
                    strokeWidth={3}
                    dot={false}
                    name="Weekly Avg"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </article>
          </section>

          <section className="options-stack">
            <article className="panel">
              <h3>Weekly Table + Sparkline</h3>
              <div className="table-wrap">
                <table className="scores-table">
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Date</th>
                      <th>G1</th>
                      <th>G2</th>
                      <th>G3</th>
                      <th>Total</th>
                      <th>+/-</th>
                      <th>Spark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamWeeklyRows.map((row, index) => (
                      <tr
                        key={`team-week-${row.date}-${row.week}`}
                        className={index === selectedTeamWeekIndex ? "active" : ""}
                        onClick={() => setSelectedTeamWeekIndex(index)}
                      >
                        <td>W{row.week}</td>
                        <td>{formatShortDate(row.date)}</td>
                        <td>{row.game1}</td>
                        <td>{row.game2}</td>
                        <td>{row.game3}</td>
                        <td>{row.scratch_series}</td>
                        <td>{row.plus_minus_avg >= 0 ? `+${row.plus_minus_avg}` : row.plus_minus_avg}</td>
                        <td>
                          <Sparkline values={[row.game1, row.game2, row.game3]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}

function BowlerPage() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<string>("");
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Papa.parse<Record<string, unknown>>("/team_scores.csv", {
      header: true,
      download: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!active) return;
        const parsed = result.data
          .map(normalizeRow)
          .filter((r) => r.bowler && r.date)
          .sort((a, b) => +parseDateString(a.date) - +parseDateString(b.date));
        setRows(parsed);
        if (parsed.length > 0) {
          const bowlerNames = Array.from(new Set(parsed.map((row) => row.bowler)));
          setSelectedBowler(bowlerNames.includes("Jim") ? "Jim" : bowlerNames[0]);
        }
        setLoading(false);
      },
      error: (err) => {
        if (!active) return;
        setError(`Failed to load CSV: ${err.message}`);
        setLoading(false);
      },
    });

    return () => {
      active = false;
    };
  }, []);

  const bowlers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.bowler))).sort(),
    [rows]
  );

  const bowlerRows = useMemo(
    () => rows.filter((r) => r.bowler === selectedBowler),
    [rows, selectedBowler]
  );

  const seasons = useMemo(() => {
    return Array.from(new Set(bowlerRows.map((row) => row.season)))
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
  }, [bowlerRows]);

  useEffect(() => {
    if (seasons.length === 0) {
      if (selectedSeason !== "") setSelectedSeason("");
      return;
    }
    if (!selectedSeason || !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  const activeRows = useMemo(
    () => (selectedSeason ? bowlerRows.filter((row) => row.season === selectedSeason) : []),
    [bowlerRows, selectedSeason]
  );

  useEffect(() => {
    if (activeRows.length === 0) {
      setSelectedWeekIndex(0);
      return;
    }
    setSelectedWeekIndex(activeRows.length - 1);
  }, [activeRows]);

  const latest = activeRows[activeRows.length - 1];
  const bestGame = useMemo(() => {
    if (activeRows.length === 0) return 0;
    return Math.max(...activeRows.map((r) => Math.max(r.game1, r.game2, r.game3)));
  }, [activeRows]);
  const bestSeries = useMemo(() => {
    if (activeRows.length === 0) return 0;
    return Math.max(...activeRows.map((r) => r.scratch_series));
  }, [activeRows]);
  const highHandicapGame = useMemo(() => {
    const playedRows = activeRows.filter((r) => r.scratch_series > 0);
    if (playedRows.length === 0) return 0;
    return Math.max(
      ...playedRows.map((r) =>
        Math.max(r.game1 + r.handicap, r.game2 + r.handicap, r.game3 + r.handicap)
      )
    );
  }, [activeRows]);
  const highHandicapSeries = useMemo(() => {
    const playedRows = activeRows.filter((r) => r.scratch_series > 0);
    if (playedRows.length === 0) return 0;
    return Math.max(...playedRows.map((r) => r.handicap_series));
  }, [activeRows]);
  const seasonDelta = useMemo(
    () =>
      activeRows
        .filter((r) => r.scratch_series !== 0)
        .reduce((sum, r) => sum + r.plus_minus_avg, 0),
    [activeRows]
  );

  const rankedRows = useMemo(
    () => activeRows.filter((row) => row.scratch_series !== 0),
    [activeRows]
  );
  const bestWeeks = useMemo(
    () => [...rankedRows].sort((a, b) => b.plus_minus_avg - a.plus_minus_avg).slice(0, 3),
    [rankedRows]
  );
  const toughWeeks = useMemo(
    () => [...rankedRows].sort((a, b) => a.plus_minus_avg - b.plus_minus_avg).slice(0, 3),
    [rankedRows]
  );

  if (loading) return <section className="shell">Loading dashboard...</section>;
  if (error) return <section className="shell">{error}</section>;
  if (rows.length === 0) return <section className="shell">No score data found.</section>;

  return (
    <>
      <header className="hero">
        <div>
          <h1>{selectedBowler || "Bowler"}</h1>
        </div>
        <div className="filters">
          <label className="bowler-picker">
            Bowler
            <select
              value={selectedBowler}
              onChange={(e) => setSelectedBowler(e.target.value)}
            >
              {bowlers.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="bowler-picker">
            Season
            <select
              value={selectedSeason || seasons[0] || ""}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              {seasons.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {activeRows.length === 0 ? (
        <section className="panel empty-state">No data for this bowler/season filter.</section>
      ) : (
        <>
          <section className="top-grid">
            <article className="panel summary-tile">
              <h3>Season Snapshot</h3>
              <div className="summary-grid">
                <div className="mini-stat">
                  <p>Current Avg</p>
                  <h2>{latest?.avg_after ?? 0}</h2>
                </div>
                <div className="mini-stat">
                  <p>Best Game</p>
                  <h2>{bestGame}</h2>
                </div>
                <div className="mini-stat">
                  <p>Best Series</p>
                  <h2>{bestSeries}</h2>
                </div>
                <div className="mini-stat">
                  <p>Season +/-</p>
                  <h2 className={seasonDelta >= 0 ? "good" : "bad"}>
                    {seasonDelta >= 0 ? `+${seasonDelta}` : seasonDelta}
                  </h2>
                </div>
                <div className="mini-stat">
                  <p>High HCP Game</p>
                  <h2>{highHandicapGame}</h2>
                </div>
                <div className="mini-stat">
                  <p>High HCP Series</p>
                  <h2>{highHandicapSeries}</h2>
                </div>
              </div>
            </article>

            <article className="panel">
              <h3>Best and Toughest Weeks</h3>
              <div className="insight-grid">
                <div>
                  <p className="insight-title">Top 3 +/- Weeks</p>
                  {bestWeeks.map((row) => (
                    <div key={`best-${getWeekKey(row)}`} className="insight-row">
                      <span className="insight-meta">
                        <span className="insight-week">Week {row.week}</span>
                        <span className="insight-date">{formatShortDate(row.date)}</span>
                      </span>
                      <span className="good">
                        {row.plus_minus_avg >= 0 ? `+${row.plus_minus_avg}` : row.plus_minus_avg}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="insight-title">Bottom 3 +/- Weeks</p>
                  {toughWeeks.map((row) => (
                    <div key={`worst-${getWeekKey(row)}`} className="insight-row">
                      <span className="insight-meta">
                        <span className="insight-week">Week {row.week}</span>
                        <span className="insight-date">{formatShortDate(row.date)}</span>
                      </span>
                      <span className="bad">{row.plus_minus_avg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          <section className="chart-grid">
            <article className="panel wide">
              <h3>Average + Scratch Series Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={activeRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#2a2f38" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} stroke="#98a1b3" />
                  <YAxis yAxisId="left" stroke="#4fd1c5" width={56} />
                  <YAxis yAxisId="right" orientation="right" stroke="#fbbf24" width={56} />
                  <Tooltip
                    labelFormatter={(v) => formatShortDate(String(v))}
                    contentStyle={{ background: "#11151b", border: "1px solid #27303d" }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="right"
                    dataKey="scratch_series"
                    fill="#f59e0b"
                    name="Scratch Series"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="avg_after"
                    stroke="#2dd4bf"
                    strokeWidth={3}
                    dot={false}
                    name="Avg After"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </article>

            <article className="panel wide">
              <h3>Weekly +/- Avg</h3>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={activeRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#2a2f38" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} stroke="#98a1b3" />
                  <YAxis stroke="#98a1b3" width={56} />
                  <YAxis
                    orientation="right"
                    width={56}
                    axisLine={false}
                    tickLine={false}
                    tick={false}
                  />
                  <Tooltip
                    labelFormatter={(v) => formatShortDate(String(v))}
                    contentStyle={{ background: "#11151b", border: "1px solid #27303d" }}
                    labelStyle={{ color: "#e8edf7" }}
                    itemStyle={{ color: "#e8edf7" }}
                  />
                  <Bar dataKey="plus_minus_avg" radius={[4, 4, 0, 0]}>
                    {activeRows.map((entry) => (
                      <Cell
                        key={`${entry.week}-${entry.date}`}
                        fill={entry.plus_minus_avg >= 0 ? "#10b981" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </article>
          </section>

          <section className="options-stack">
            <article className="panel">
              <h3>Weekly Table + Sparkline</h3>
              <div className="table-wrap">
                <table className="scores-table">
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Date</th>
                      <th>G1</th>
                      <th>G2</th>
                      <th>G3</th>
                      <th>Total</th>
                      <th>+/-</th>
                      <th>Spark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row, index) => (
                      <tr
                        key={getWeekKey(row)}
                        className={index === selectedWeekIndex ? "active" : ""}
                        onClick={() => setSelectedWeekIndex(index)}
                      >
                        <td>W{row.week}</td>
                        <td>{formatShortDate(row.date)}</td>
                        <td>{row.game1}</td>
                        <td>{row.game2}</td>
                        <td>{row.game3}</td>
                        <td>{row.scratch_series}</td>
                        <td>{row.plus_minus_avg >= 0 ? `+${row.plus_minus_avg}` : row.plus_minus_avg}</td>
                        <td>
                          <Sparkline values={[row.game1, row.game2, row.game3]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = "#/bowler";
    }

    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <main>
      <header className="top-nav">
        <div className="brand">
          <div className="brand-icon">
            <BowlingIcon />
          </div>
          <span className="brand-name">This is Bowl Sh!t</span>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <a
            href="#/bowler"
            className={`nav-link ${route === "bowler" ? "active" : ""}`}
          >
            Bowler
          </a>
          <a
            href="#/team"
            className={`nav-link ${route === "team" ? "active" : ""}`}
          >
            Team
          </a>
        </nav>
      </header>

      <section className="shell">{route === "bowler" ? <BowlerPage /> : <TeamPage />}</section>
    </main>
  );
}
