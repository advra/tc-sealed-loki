import fs from "node:fs";
import path from "node:path";

export class ImportLogger {
  private logStream: fs.WriteStream | null = null;
  private logFilePath: string = "";

  constructor() {
    this.setupLogFile();
  }

  private setupLogFile() {
    try {
      const logsDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const now = new Date();
      const isoDate = now.toISOString();
      const dateStringResult = isoDate.split("T");
      if (dateStringResult?.length > 0) {
        const dateStr = dateStringResult[0]?.replace(/-/g, "");
        const timeParts = now.toTimeString().split(" ");
        const timeStr = timeParts[0] ? timeParts[0].replace(/:/g, "") : "000000";

        this.logFilePath = path.join(logsDir, `scrape_sealed_v2_log_${dateStr}_${timeStr}.txt`);
        this.logStream = fs.createWriteStream(this.logFilePath, { flags: "a" });

        this.log(`Log file created: ${this.logFilePath}`);
      }
    } catch (error) {
      console.error("Failed to create log file:", error);
    }
  }

  log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    if (this.logStream) {
      this.logStream.write(logMessage + "\n");
    }
  }

  error(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    const errorMessage = error ? `${message}: ${error}` : message;
    const logMessage = `[${timestamp}] ERROR: ${errorMessage}`;
    console.error(logMessage);
    if (this.logStream) {
      this.logStream.write(logMessage + "\n");
    }
  }

  warn(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] WARN: ${message}`;
    console.warn(logMessage);
    if (this.logStream) {
      this.logStream.write(logMessage + "\n");
    }
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}