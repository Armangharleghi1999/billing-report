import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  DuplicateItem,
  IngestResult,
  resolveDuplicates,
  uploadStatement,
} from "../api/client";
import DuplicateReviewModal from "../components/DuplicateReviewModal";

interface FileResult {
  filename: string;
  result?: IngestResult;
  error?: string;
}

export default function Upload() {
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showDupModal, setShowDupModal] = useState(false);
  const [allDuplicates, setAllDuplicates] = useState<
    { statementId: number; duplicates: DuplicateItem[] }[]
  >([]);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setFileResults([]);
    setAllDuplicates([]);

    const results: FileResult[] = [];
    const dupGroups: { statementId: number; duplicates: DuplicateItem[] }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(
        files.length > 1 ? `Uploading ${i + 1} of ${files.length}...` : "Processing..."
      );
      try {
        const res = await uploadStatement(file);
        results.push({ filename: file.name, result: res });
        if (res.duplicates.length > 0 && res.statement_id != null) {
          dupGroups.push({ statementId: res.statement_id, duplicates: res.duplicates });
        }
      } catch (e: any) {
        results.push({ filename: file.name, error: e.message });
      }
      setFileResults([...results]);
    }

    setUploadProgress(null);

    if (dupGroups.length > 0) {
      setAllDuplicates(dupGroups);
      setShowDupModal(true);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
  });

  const handleDupResolve = async (
    resolutions: { dedup_hash: string; action: string }[]
  ) => {
    for (const group of allDuplicates) {
      const relevant = resolutions.filter((r) =>
        group.duplicates.some((d) => d.incoming.dedup_hash === r.dedup_hash)
      );
      if (relevant.length > 0) {
        await resolveDuplicates(group.statementId, relevant);
      }
    }
    setShowDupModal(false);
  };

  const totalNew = fileResults.reduce((s, r) => s + (r.result?.new_count ?? 0), 0);
  const totalDups = fileResults.reduce((s, r) => s + (r.result?.duplicate_count ?? 0), 0);
  const errorCount = fileResults.filter((r) => r.error).length;
  const combinedDuplicates = allDuplicates.flatMap((g) => g.duplicates);

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Upload Statement
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
        Drop one or more AMEX or Chase PDF statements. The source is detected automatically.
      </p>

      {/* Drop zone */}
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
          marginBottom: 24,
        }}
      >
        <input {...getInputProps()} />
        {uploadProgress ? (
          <p style={{ color: "var(--text-muted)" }}>{uploadProgress}</p>
        ) : isDragActive ? (
          <p style={{ color: "var(--primary)" }}>Drop PDFs here</p>
        ) : (
          <div>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              Drag & drop one or more PDFs here, or click to browse
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Accepted: .pdf — AMEX or Chase statements (auto-detected)
            </p>
          </div>
        )}
      </div>

      {/* Per-file results */}
      {fileResults.length > 0 && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Import Summary — {fileResults.length} file{fileResults.length > 1 ? "s" : ""}
          </h3>

          {fileResults.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: 20,
                marginBottom: 16,
                fontSize: 13,
                padding: "10px 14px",
                background: "var(--bg)",
                borderRadius: "var(--radius)",
              }}
            >
              <span>Total new: <strong>{totalNew}</strong></span>
              <span>Total duplicates: <strong>{totalDups}</strong></span>
              {errorCount > 0 && (
                <span style={{ color: "var(--danger)" }}>Errors: <strong>{errorCount}</strong></span>
              )}
            </div>
          )}

          {fileResults.map((fr, i) => (
            <div
              key={i}
              style={{
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                paddingTop: i > 0 ? 12 : 0,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{fr.filename}</span>
                  {fr.result?.detected_source && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background:
                          fr.result.detected_source === "amex"
                            ? "rgba(99,102,241,0.15)"
                            : "rgba(34,197,94,0.15)",
                        color:
                          fr.result.detected_source === "amex"
                            ? "var(--primary)"
                            : "var(--success)",
                      }}
                    >
                      {fr.result.detected_source}
                    </span>
                  )}
                </div>
                {fr.error ? (
                  <span style={{ color: "var(--danger)", fontSize: 12 }}>{fr.error}</span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {fr.result?.new_count} new · {fr.result?.duplicate_count} duplicates
                  </span>
                )}
              </div>

              {fr.result && fr.result.new.length > 0 && (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fr.result.new.slice(0, 10).map((t, j) => (
                      <tr key={j}>
                        <td style={tdStyle}>{t.date}</td>
                        <td style={tdStyle}>{t.description}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {t.is_credit ? "+" : "-"}£{Number(t.amount).toFixed(2)}
                        </td>
                        <td style={tdStyle}>{t.category ?? "—"}</td>
                      </tr>
                    ))}
                    {fr.result.new.length > 10 && (
                      <tr>
                        <td colSpan={4} style={{ ...tdStyle, color: "var(--text-muted)", fontSize: 12 }}>
                          ...and {fr.result.new.length - 10} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {showDupModal && combinedDuplicates.length > 0 && (
        <DuplicateReviewModal
          duplicates={combinedDuplicates}
          onResolve={handleDupResolve}
          onClose={() => setShowDupModal(false)}
        />
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 8,
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontWeight: 500,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
};
