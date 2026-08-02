import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { CheckCircle, Error as ErrorIcon } from "@mui/icons-material";
import type { Dashboard } from "../types";

function HealthChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Chip
      size="small"
      color={ok ? "success" : "error"}
      icon={ok ? <CheckCircle /> : <ErrorIcon />}
      label={`${label}: ${ok ? "up" : "down"}`}
    />
  );
}

export default function AuthStatus({ data }: { data: Dashboard }) {
  const { auth, health } = data;
  const expired = auth.expiresAt ? auth.expiresAt < Date.now() : true;

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent>
        <Box className="mb-3 flex items-center gap-2">
          <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40 }}>
            {auth.name ? auth.name.charAt(0).toUpperCase() : "?"}
          </Avatar>
          <div>
            <Typography variant="h6" fontWeight={700}>
              {auth.name || "Not authorized"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {auth.email || "—"}
            </Typography>
          </div>
        </Box>

        <Stack direction="row" flexWrap="wrap" gap={1} className="mb-3">
          <Chip
            size="small"
            color={auth.authorized ? "success" : "error"}
            icon={auth.authorized ? <CheckCircle /> : <ErrorIcon />}
            label={auth.authorized ? "Authorized" : "Not authorized"}
          />
          <Chip
            size="small"
            color={expired ? "error" : "default"}
            label={
              auth.expiresAt
                ? `Expires: ${new Date(auth.expiresAt).toLocaleString()}`
                : "No access token"
            }
          />
          <Chip
            size="small"
            label={auth.hasRefreshToken ? "Refresh token: yes" : "Refresh token: no"}
          />
        </Stack>

        <Divider className="mb-3" />

        <Typography variant="overline" color="text.secondary" className="mb-2 block">
          Health
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <HealthChip ok={health.redis} label="Redis" />
          <HealthChip ok={health.linkedin} label="LinkedIn" />
        </Stack>

        {!auth.authorized && (
          <Box className="mt-3">
            <Typography variant="body2" color="text.secondary">
              Authorize at{" "}
              <a href="/api/authorize" className="font-medium text-[#0a66c2]">
                /api/authorize
              </a>
              .
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}