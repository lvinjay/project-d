type Props = {
  text: string;
  onClick?: () => void;
};

export default function PrimaryButton({
  text,
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#2563eb",
        color: "white",
        border: "none",
        padding: "18px 50px",
        borderRadius: 12,
        fontSize: 18,
        cursor: "pointer",
      }}
    >
      {text}
    </button>
  );
}