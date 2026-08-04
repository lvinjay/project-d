type Props = {
  label: string;
  value: number;
};

export default function ScoreBar({ label, value }: Props) {
  return (
    <div className="scoreRow">
      <div className="scoreLabel"><span>{label}</span><strong>{value}</strong></div>
      <div className="scoreTrack"><div className="scoreFill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}
