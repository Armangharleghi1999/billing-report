import { useEffect } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { fetchSummary } from "./api/client";
import Budgeting from "./pages/Budgeting";
import Dashboard from "./pages/Dashboard";
import Rules from "./pages/Rules";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";
import Upload from "./pages/Upload";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/upload", label: "Upload" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budgeting", label: "Budgeting" },
  { to: "/rules", label: "Rules & Categories" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/upload") return;
    fetchSummary().then((summary) => {
      if (summary.total_transactions === 0) navigate("/upload");
    }).catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 220,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 24,
            color: "var(--primary)",
          }}
        >
          Spending Visualiser
        </h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              display: "block",
              padding: "10px 14px",
              borderRadius: "var(--radius)",
              color: isActive ? "#fff" : "var(--text-muted)",
              background: isActive ? "var(--primary)" : "transparent",
              fontWeight: isActive ? 600 : 400,
              fontSize: 14,
              transition: "all 0.15s",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgeting" element={<Budgeting />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
