"use client";

/**
 * useRobot - React hook for robot state management
 * 
 * Provides real-time robot state, connection management, and command functions
 * for use in both the compact HUD panel and full diagnostics page.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { robotClient, type RobotState } from "@/lib/robot/client";
import type {
  RobotDiagnostics,
  RobotSensors,
  RobotConnectionState,
  RobotHealthResponse,
} from "@/lib/robot/types";

export interface UseRobotOptions {
  /**
   * Automatically connect on mount
   * @default true
   */
  autoConnect?: boolean;
  /**
   * Poll for sensor data at this interval (ms). Set to 0 to disable.
   * @default 0
   */
  sensorPollingMs?: number;
  /**
   * Poll for diagnostics at this interval (ms). Set to 0 to disable.
   * @default 0
   */
  diagnosticsPollingMs?: number;
}

export interface UseRobotReturn {
  // State
  state: RobotState;
  connection: RobotConnectionState;
  isReady: boolean;
  isStreaming: boolean;
  
  // Connection
  connect: () => void;
  disconnect: () => void;
  checkHealth: () => Promise<RobotHealthResponse | null>;
  
  // Commands
  stop: () => Promise<void>;
  move: (v: number, w: number) => Promise<void>;
  directMotor: (left: number, right: number) => Promise<void>;
  setServo: (angle: number) => Promise<void>;
  
  // Streaming
  startStreaming: (v: number, w: number, options?: { rateHz?: number; ttlMs?: number }) => Promise<void>;
  updateStreaming: (v: number, w: number) => void;
  stopStreaming: (hardStop?: boolean) => Promise<void>;
  
  // Data
  getDiagnostics: () => Promise<RobotDiagnostics | null>;
  getSensors: () => Promise<RobotSensors>;
  
  // Serial console
  clearSerialLog: () => void;
}

export function useRobot(options: UseRobotOptions = {}): UseRobotReturn {
  const { 
    autoConnect = true, 
    sensorPollingMs = 0,
    diagnosticsPollingMs = 0,
  } = options;
  
  const [state, setState] = useState<RobotState>(robotClient.getState());
  const sensorPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diagnosticsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = robotClient.subscribe((newState) => {
      setState(newState);
    });
    
    return unsubscribe;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      robotClient.connect();
    }
    
    return () => {
      // Don't disconnect on unmount - other components may be using it
      // robotClient.disconnect();
    };
  }, [autoConnect]);

  // Sensor polling
  useEffect(() => {
    if (sensorPollingMs > 0 && state.connection === "ready") {
      sensorPollingRef.current = setInterval(async () => {
        try {
          await getSensors();
        } catch (error) {
          console.error("[useRobot] Sensor polling error:", error);
        }
      }, sensorPollingMs);
    }
    
    return () => {
      if (sensorPollingRef.current) {
        clearInterval(sensorPollingRef.current);
        sensorPollingRef.current = null;
      }
    };
  }, [sensorPollingMs, state.connection]);

  // Diagnostics polling
  useEffect(() => {
    if (diagnosticsPollingMs > 0 && state.connection === "ready") {
      diagnosticsPollingRef.current = setInterval(async () => {
        try {
          await robotClient.getDiagnostics();
        } catch (error) {
          console.error("[useRobot] Diagnostics polling error:", error);
        }
      }, diagnosticsPollingMs);
    }
    
    return () => {
      if (diagnosticsPollingRef.current) {
        clearInterval(diagnosticsPollingRef.current);
        diagnosticsPollingRef.current = null;
      }
    };
  }, [diagnosticsPollingMs, state.connection]);

  // Connection functions
  const connect = useCallback(() => {
    robotClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    robotClient.disconnect();
  }, []);

  const checkHealth = useCallback(async (): Promise<RobotHealthResponse | null> => {
    return robotClient.checkHealth();
  }, []);

  // Command functions
  const stop = useCallback(async (): Promise<void> => {
    await robotClient.stop();
  }, []);

  const move = useCallback(async (v: number, w: number): Promise<void> => {
    // Convert v (forward velocity) and w (turn rate) to L/R motor values
    // v: positive = forward, negative = backward
    // w: positive = turn right (left faster), negative = turn left (right faster)
    const left = Math.max(-255, Math.min(255, Math.round(v + w)));
    const right = Math.max(-255, Math.min(255, Math.round(v - w)));
    await robotClient.directMotor(left, right);
  }, []);

  const directMotor = useCallback(async (left: number, right: number): Promise<void> => {
    await robotClient.directMotor(left, right);
  }, []);

  const setServo = useCallback(async (angle: number): Promise<void> => {
    await robotClient.setServo(angle);
  }, []);

  // Streaming functions
  const startStreaming = useCallback(async (
    v: number, 
    w: number, 
    streamOptions?: { rateHz?: number; ttlMs?: number }
  ): Promise<void> => {
    await robotClient.startStreaming(v, w, streamOptions);
  }, []);

  const updateStreaming = useCallback((v: number, w: number): void => {
    robotClient.updateStreaming(v, w);
  }, []);

  const stopStreaming = useCallback(async (hardStop = true): Promise<void> => {
    await robotClient.stopStreaming(hardStop);
  }, []);

  // Data functions
  const getDiagnostics = useCallback(async (): Promise<RobotDiagnostics | null> => {
    return robotClient.getDiagnostics();
  }, []);

  const getSensors = useCallback(async (): Promise<RobotSensors> => {
    const now = Date.now();
    
    // Fetch all sensors in parallel
    const [distance, left, middle, right, battery] = await Promise.all([
      robotClient.getUltrasonic("distance").catch(() => 0),
      robotClient.getLineSensor("left").catch(() => 0),
      robotClient.getLineSensor("middle").catch(() => 0),
      robotClient.getLineSensor("right").catch(() => 0),
      robotClient.getBattery().catch(() => 0),
    ]);

    // Calculate battery percentage (7.4V 2S LiPo: 6.0V=0%, 8.4V=100%)
    const batteryVoltage = battery as number;
    const batteryPercent = Math.max(0, Math.min(100, 
      ((batteryVoltage - 6000) / (8400 - 6000)) * 100
    ));

    const sensors: RobotSensors = {
      ultrasonic: {
        distance: distance as number,
        obstacle: (distance as number) > 0 && (distance as number) <= 20,
        timestamp: now,
      },
      lineSensor: {
        left: left as number,
        middle: middle as number,
        right: right as number,
        timestamp: now,
      },
      battery: {
        voltage: batteryVoltage,
        percent: batteryPercent,
        timestamp: now,
      },
    };

    return sensors;
  }, []);

  // Serial log functions
  const clearSerialLog = useCallback(() => {
    // This would need to be added to robotClient
    // For now, we can't clear it from here
  }, []);

  return {
    // State
    state,
    connection: state.connection,
    isReady: state.connection === "ready",
    isStreaming: state.bridgeStatus?.streaming ?? false,
    
    // Connection
    connect,
    disconnect,
    checkHealth,
    
    // Commands
    stop,
    move,
    directMotor,
    setServo,
    
    // Streaming
    startStreaming,
    updateStreaming,
    stopStreaming,
    
    // Data
    getDiagnostics,
    getSensors,
    
    // Serial
    clearSerialLog,
  };
}

export default useRobot;

