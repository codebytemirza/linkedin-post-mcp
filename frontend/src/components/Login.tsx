import { useState } from "react";
import {
  Box,
  Button,
  Card,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import Lock from "@mui/icons-material/Lock";
import LockOutlined from "@mui/icons-material/LockOutlined";

interface Props {
  onSubmit: (token: string) => void;
}

export default function Login({ onSubmit }: Props) {
  const [token, setToken] = useState("");

  return (
    <Box
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a66c2] via-[#0a66c2] to-[#063a6e] p-6"
    >
      <Card className="w-full max-w-sm p-8 shadow-2xl" sx={{ borderRadius: 4 }}>
        <Box className="flex flex-col items-center gap-3 text-center">
          <Box className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0a66c2] text-white">
            <Lock />
          </Box>
          <Typography variant="h5" fontWeight={700}>
            LinkedIn MCP Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter the MCP bearer token to view logs, posts, and health.
          </Typography>
        </Box>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(token.trim());
          }}
        >
          <TextField
            fullWidth
            label="Access token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            required
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlined fontSize="small" sx={{ color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
          />
          <Button type="submit" variant="contained" size="large" fullWidth>
            View dashboard
          </Button>
        </form>
      </Card>
    </Box>
  );
}