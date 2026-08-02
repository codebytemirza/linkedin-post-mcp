import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Snackbar,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { EventNote, LinkedIn, Logout, PostAdd } from "@mui/icons-material";
import Login from "./components/Login";
import StatCards, { type Stat } from "./components/StatCards";
import AuthStatus from "./components/AuthStatus";
import PostsTable from "./components/PostsTable";
import LogTimeline from "./components/LogTimeline";
import { fetchDashboard, ApiError } from "./api";
import type { Dashboard } from "./types";

const TOKEN_KEY = "dashboard_token";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const load = useCallback(
    async (tok: string, silent = false) => {
      if (!tok) return;
      if (!silent) setLoading(true);
      try {
        setData(await fetchDashboard(tok));
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setToken("");
          localStorage.removeItem(TOKEN_KEY);
          setError("Invalid token. Please sign in again.");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleLogin = useCallback(
    (tok: string) => {
      localStorage.setItem(TOKEN_KEY, tok);
      setToken(tok);
      void load(tok);
    },
    [load]
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setData(null);
    setError(null);
  }, []);

  // Poll every 15s once authorized.
  useEffect(() => {
    if (!token) return;
    void load(token, true);
    const id = setInterval(() => void load(token, true), 15000);
    return () => clearInterval(id);
  }, [token, load]);

  if (!token) {
    return (
      <>
        <Login onSubmit={handleLogin} />
        <Snackbar
          open={!!snack}
          autoHideDuration={4000}
          onClose={() => setSnack(null)}
          message={snack}
        />
      </>
    );
  }

  const stats: Stat[] = data
    ? [
        {
          label: "Posts",
          value: data.posts.length,
          icon: <PostAdd />,
          color: "#0a66c2",
        },
        {
          label: "Errors",
          value: data.errorCount,
          icon: <Box component="span" sx={{ fontSize: 22, fontWeight: 800 }}>!</Box>,
          color: "#d93025",
        },
        {
          label: "Events",
          value: data.logs.length,
          icon: <EventNote />,
          color: "#5f6368",
        },
        {
          label: "LinkedIn",
          value: data.health.linkedin ? "Up" : "Down",
          icon: <LinkedIn />,
          color: data.health.linkedin ? "#1d7a2f" : "#d93025",
        },
      ]
    : [];

  return (
    <Box className="min-h-screen bg-[#f4f6f8]">
      <AppBar position="static" elevation={0} sx={{ bgcolor: "#0a66c2" }}>
        <Toolbar className="gap-2">
          <LinkedIn />
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
            LinkedIn MCP Dashboard
          </Typography>
          <Button
            color="inherit"
            onClick={() => void load(token)}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {loading ? "Loading" : "Refresh"}
          </Button>
          <IconButton color="inherit" onClick={handleLogout} title="Sign out">
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" className="py-6">
        {error && (
          <Alert severity="error" onClose={() => setError(null)} className="mb-4">
            {error}
          </Alert>
        )}

        {!data && loading ? (
          <Box className="grid place-items-center py-24">
            <CircularProgress />
          </Box>
        ) : data ? (
          <Stack spacing={3}>
            <StatCards stats={stats} />
            <AuthStatus data={data} />
            <PostsTable posts={data.posts} />
            <LogTimeline logs={data.logs} />
          </Stack>
        ) : null}
      </Container>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  );
}