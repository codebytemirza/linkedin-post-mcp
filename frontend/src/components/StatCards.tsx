import { Avatar, Card, CardContent, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface Stat {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: string;
}

export default function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      {stats.map((s) => (
        <Card
          key={s.label}
          className="flex-1"
          elevation={0}
          sx={{ border: "1px solid", borderColor: "divider" }}
        >
          <CardContent>
            <Stack direction="row" alignItems="center" gap={2}>
              <Avatar sx={{ bgcolor: s.color ?? "primary.main", width: 44, height: 44 }}>
                {s.icon}
              </Avatar>
              <div>
                <Typography variant="h4" fontWeight={800} lineHeight={1}>
                  {s.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.label}
                </Typography>
              </div>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}