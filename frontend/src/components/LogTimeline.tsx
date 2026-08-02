import {
  Avatar,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  Link as LinkIcon,
  PostAdd,
  Warning as WarningIcon,
  Terminal as TerminalIcon,
} from "@mui/icons-material";
import type { LogEntry } from "../types";

function iconFor(type: LogEntry["type"]) {
  switch (type) {
    case "post":
      return <PostAdd />;
    case "auth":
      return <LinkIcon />;
    case "tool":
      return <TerminalIcon />;
    case "error":
      return <WarningIcon />;
  }
}

function colorFor(level: LogEntry["level"]) {
  return level === "success"
    ? "success"
    : level === "error"
      ? "error"
      : "default";
}

export default function LogTimeline({ logs }: { logs: LogEntry[] }) {
  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} className="mb-2">
          Log timeline
        </Typography>
        {logs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No activity yet.
          </Typography>
        ) : (
          <List dense>
            {logs.map((l, i) => (
              <ListItem key={i} alignItems="flex-start">
                <ListItemAvatar>
                  <Avatar sx={{ width: 34, height: 34, bgcolor: "primary.main" }}>
                    {iconFor(l.type)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{l.action}</strong>
                      <Chip size="small" label={l.level} color={colorFor(l.level)} />
                      <Typography component="span" variant="caption" color="text.secondary">
                        {new Date(l.ts).toLocaleString()}
                      </Typography>
                    </span>
                  }
                  secondary={l.detail ? <span>{l.detail}</span> : null}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}