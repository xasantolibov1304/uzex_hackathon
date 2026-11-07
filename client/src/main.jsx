import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// StrictMode ishlatilmaydi: WebGL avatar va SSE oqimi effektlar ikki marta ishlashiga mo'ljallanmagan.
createRoot(document.getElementById("root")).render(<App />);
