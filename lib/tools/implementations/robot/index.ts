/**
 * Robot Tools - Export all robot tool implementations
 */

// Status tools (READ tier)
export {
  getRobotStatus,
  getRobotStatusSchema,
  getRobotStatusOutputSchema,
  getRobotDiagnostics,
  getRobotDiagnosticsSchema,
  getRobotDiagnosticsOutputSchema,
} from "./status";

// Motion tools (ACT tier)
export {
  robotMove,
  robotMoveSchema,
  robotMoveOutputSchema,
  robotStop,
  robotStopSchema,
  robotStopOutputSchema,
  robotStreamStart,
  robotStreamStartSchema,
  robotStreamStartOutputSchema,
  robotStreamStop,
  robotStreamStopSchema,
  robotStreamStopOutputSchema,
} from "./motion";

// Sensor tools (READ tier)
export {
  getRobotSensors,
  getRobotSensorsSchema,
  getRobotSensorsOutputSchema,
} from "./sensors";

