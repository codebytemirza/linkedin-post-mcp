import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import App from "./App";
import "./index.css";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0a66c2" },
    success: { main: "#1d7a2f" },
    error: { main: "#d93025" },
    background: { default: "#f4f6f8" },
  },
  shape: { borderRadius: 12 },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);