import "./globals.css";
import { useCall } from "./contexts/call-context";
import { UsernameForm } from "./components/username-form";
import { Lobby } from "./components/lobby";
import { Room } from "./components/room";

function App() {
  const { username, phase } = useCall();

  if (!username) {
    return <UsernameForm />;
  }

  if (phase === "in-room") {
    return <Room />;
  }

  return <Lobby />;
}

export default App;
