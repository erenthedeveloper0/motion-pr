import { installAgent } from "./main.ts";

// Entry point for the bundled agent script (IIFE). Runs before any page script.
installAgent(window);
