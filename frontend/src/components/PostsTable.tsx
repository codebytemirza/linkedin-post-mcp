import {
  Avatar,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { PostAdd, Image as ImageIcon } from "@mui/icons-material";
import type { LogEntry } from "../types";

export default function PostsTable({ posts }: { posts: LogEntry[] }) {
  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} className="mb-2">
          Recent posts
        </Typography>
        {posts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No posts recorded yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Post ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {posts.map((p, i) => (
                  <TableRow key={i} hover>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Avatar sx={{ width: 22, height: 22, bgcolor: "primary.main" }}>
                          {p.action === "create_image_post" ? <ImageIcon /> : <PostAdd />}
                        </Avatar>
                        {p.action}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(p.ts).toLocaleString()}</TableCell>
                    <TableCell sx={{ wordBreak: "break-all" }}>
                      <code>{p.postId || "—"}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}