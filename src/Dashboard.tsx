import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadialBarChart,
  RadialBar,
  AreaChart,
  Area,
} from "recharts";

type QuestionResult = {
  question: string;
  sources: string[];
  num_sources: number;
  precision: number;
  recall: number;
  mrr: number;
  ndcg: number;
  judge: { accuracy: number; completeness: number; relevance: number; reason: string };
};

type EvalResults = {
  summary: {
    questions_evaluated: number;
    precision: number;
    recall: number;
    mrr: number;
    ndcg: number;
    accuracy: number;
    completeness: number;
    relevance: number;
  };
  questions: QuestionResult[];
};

const axisStyle = { fill: "#898781", fontSize: 12 };
const tooltipStyle = {
  background: "#fcfcfb",
  border: "1px solid #e1e0d9",
  borderRadius: 8,
  fontSize: 13,
};

function RingScore({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = (value / 5) * 100;
  const data = [{ value: pct }];

  return (
    <div className="ring-item">
      <div className="ring-wrap">
        <ResponsiveContainer width={128} height={128}>
          <RadialBarChart
            innerRadius="76%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
            barSize={12}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} axisLine={false} />
            <RadialBar background={{ fill: "#e1e0d9" }} dataKey="value" cornerRadius={10} fill={color} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="ring-value">{value.toFixed(1)}</div>
      </div>
      <span className="ring-label">{label}</span>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState<EvalResults | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/eval/results")
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) return <p style={{ padding: 24 }}>Loading eval results...</p>;

  const radarData = [
    { metric: "Precision", value: data.summary.precision },
    { metric: "Recall", value: data.summary.recall },
    { metric: "MRR", value: data.summary.mrr },
    { metric: "NDCG", value: data.summary.ndcg },
  ];

  const avgRetrieval =
    (data.summary.precision + data.summary.recall + data.summary.mrr + data.summary.ndcg) / 4;
  const avgJudge =
    (data.summary.accuracy + data.summary.completeness + data.summary.relevance) / 3;

  const qualityOf = (q: QuestionResult) =>
    (q.judge.accuracy + q.judge.completeness + q.judge.relevance) / 3;

  const byFile: Record<string, { total: number; count: number }> = {};
  data.questions.forEach((q) => {
    const score = qualityOf(q);
    q.sources.forEach((file) => {
      if (!byFile[file]) byFile[file] = { total: 0, count: 0 };
      byFile[file].total += score;
      byFile[file].count += 1;
    });
  });

  const byFileData = Object.entries(byFile)
    .map(([name, { total, count }]) => ({ name, value: total / count }))
    .sort((a, b) => a.value - b.value);

  const byCount: Record<number, { total: number; count: number }> = {};
  data.questions.forEach((q) => {
    const score = qualityOf(q);
    if (!byCount[q.num_sources]) byCount[q.num_sources] = { total: 0, count: 0 };
    byCount[q.num_sources].total += score;
    byCount[q.num_sources].count += 1;
  });

  const byCountData = Object.entries(byCount)
    .map(([num, { total, count }]) => ({
      name: `${num} source${num === "1" ? "" : "s"}`,
      value: total / count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dashboard">
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-value">{data.summary.questions_evaluated}</div>
          <div className="kpi-label">Questions evaluated</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "#2a78d6" }}>
            {avgRetrieval.toFixed(2)}
          </div>
          <div className="kpi-label">Avg. retrieval quality</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "#1baf7a" }}>
            {avgJudge.toFixed(1)}
            <span className="kpi-value-suffix"> / 5</span>
          </div>
          <div className="kpi-label">Avg. judge score</div>
        </div>
      </div>

      <div className="bento-grid">
        <div className="bento-card span-5">
          <p className="card-eyebrow">Retrieval Quality</p>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#e1e0d9" />
              <PolarAngleAxis dataKey="metric" tick={axisStyle} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Radar
                dataKey="value"
                stroke="#2a78d6"
                fill="#2a78d6"
                fillOpacity={0.14}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="bento-card span-7">
          <p className="card-eyebrow">Answer Quality (LLM as Judge)</p>
          <div className="judge-rings">
            <RingScore label="Accuracy" value={data.summary.accuracy} color="#1baf7a" />
            <RingScore label="Completeness" value={data.summary.completeness} color="#1baf7a" />
            <RingScore label="Relevance" value={data.summary.relevance} color="#1baf7a" />
          </div>
        </div>
      </div>

      <div className="bento-grid">
        <div className="bento-card span-7">
          <p className="card-eyebrow">Struggle by Source File</p>
          <ResponsiveContainer width="100%" height={Math.max(300, byFileData.length * 44)}>
            <BarChart data={byFileData} layout="vertical" barCategoryGap="30%">
              <CartesianGrid horizontal={false} stroke="#e1e0d9" />
              <XAxis type="number" domain={[0, 5]} tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={axisStyle}
                axisLine={{ stroke: "#c3c2b7" }}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(11,11,11,0.03)" }} />
              <Bar dataKey="value" fill="#e34948" radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bento-card span-5">
          <p className="card-eyebrow">Struggle by Number of Sources Needed</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={byCountData}>
              <CartesianGrid vertical={false} stroke="#e1e0d9" />
              <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
              <YAxis domain={[0, 5]} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#c3c2b7" }} />
              <Area
                dataKey="value"
                stroke="#4a3aa7"
                fill="#4a3aa7"
                fillOpacity={0.12}
                strokeWidth={2}
                dot={{ r: 3.5, fill: "#4a3aa7", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;