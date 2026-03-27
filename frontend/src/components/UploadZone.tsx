import { useDropzone } from "react-dropzone";

interface Props {
  onDrop: (files: File[]) => void;
  label: string;
  uploading: boolean;
}

export default function UploadZone({ onDrop, label, uploading }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragActive ? "var(--primary)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "60px 40px",
        textAlign: "center",
        cursor: "pointer",
        background: isDragActive ? "rgba(99,102,241,0.05)" : "var(--bg-card)",
        transition: "all 0.2s",
      }}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <p style={{ color: "var(--text-muted)" }}>Processing...</p>
      ) : isDragActive ? (
        <p style={{ color: "var(--primary)" }}>Drop PDF here</p>
      ) : (
        <div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>
            Drag & drop a PDF here, or click to browse
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</p>
        </div>
      )}
    </div>
  );
}
