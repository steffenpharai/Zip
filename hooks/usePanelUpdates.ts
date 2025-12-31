"use client";

import { useEffect, useState, useRef } from "react";
import { useEmitEvent } from "@/lib/events/hooks";
import { INTERVALS } from "@/lib/constants";
import { useHudStore } from "@/lib/state/hudStore";

export function usePanelUpdates() {
  const emit = useEmitEvent();
  const { state } = useHudStore();
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState<number>(0);
  const isUpdatingRef = useRef<boolean>(false);

  // Get user's location using browser geolocation API
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation && !locationRequested) {
      setLocationRequested(true);
      console.log("Requesting geolocation permission...");
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          setUserLocation(location);
          setLocationError(null);
          console.log("User location obtained:", location.lat, location.lon);
        },
        (error) => {
          console.warn("Geolocation error:", error.code, error.message);
          setLocationError(error.message);
          setUserLocation(null);
          
          // Log specific error codes for debugging
          switch (error.code) {
            case error.PERMISSION_DENIED:
              console.warn("Geolocation permission denied by user");
              break;
            case error.POSITION_UNAVAILABLE:
              console.warn("Geolocation position unavailable");
              break;
            case error.TIMEOUT:
              console.warn("Geolocation request timed out");
              break;
          }
        },
        {
          enableHighAccuracy: false, // Changed to false for faster response
          timeout: 10000, // Reduced timeout to 10 seconds
          maximumAge: 300000, // Use cached location up to 5 minutes old
        }
      );
    } else if (typeof navigator !== "undefined" && !navigator.geolocation) {
      console.warn("Geolocation API not available in this browser");
      setLocationError("Geolocation not supported");
    }
  }, [locationRequested]);

  useEffect(() => {
    const updatePanels = async () => {
      // Prevent concurrent updates
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;

      try {
        const now = Date.now();
        const timeSinceLastWeatherUpdate = now - lastWeatherUpdate;
        const shouldUpdateWeather = timeSinceLastWeatherUpdate >= INTERVALS.WEATHER_UPDATE_MS || lastWeatherUpdate === 0;

        // Prepare all API calls in parallel
        const promises: Promise<void>[] = [];

        // System Stats - always fetch
        promises.push(
          fetch("/api/tools/get_system_stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
            .then(async (response) => {
              if (response.ok) {
                const { result } = await response.json();
                emit({
                  type: "panel.update",
                  panel: "system",
                  payload: result,
                  ts: Date.now(),
                });
              }
            })
            .catch((error) => {
              console.error("System stats fetch error:", error);
            })
        );

        // Weather - only if location available and should update
        if (shouldUpdateWeather && userLocation) {
          const weatherBody = { lat: userLocation.lat, lon: userLocation.lon };
          promises.push(
            fetch("/api/tools/get_weather", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(weatherBody),
            })
              .then(async (response) => {
                if (response.ok) {
                  const { result } = await response.json();
                  emit({
                    type: "panel.update",
                    panel: "weather",
                    payload: result,
                    ts: Date.now(),
                  });
                  setLastWeatherUpdate(now);
                }
              })
              .catch((error) => {
                console.error("Weather fetch error:", error);
              })
          );
        }

        // Uptime - always fetch
        promises.push(
          fetch("/api/tools/get_uptime", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionStartTime: state.sessionStartTime,
              commandsCount: state.commandsCount,
            }),
          })
            .then(async (response) => {
              if (response.ok) {
                const { result } = await response.json();
                emit({
                  type: "panel.update",
                  panel: "uptime",
                  payload: result,
                  ts: Date.now(),
                });
              }
            })
            .catch((error) => {
              console.error("Uptime fetch error:", error);
            })
        );

        // Printer Status - always fetch
        promises.push(
          fetch("/api/tools/get_printer_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
            .then(async (response) => {
              if (response.ok) {
                const { result } = await response.json();
                emit({
                  type: "panel.update",
                  panel: "printer",
                  payload: result,
                  ts: Date.now(),
                });
              } else {
                const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                emit({
                  type: "panel.update",
                  panel: "printer_error",
                  payload: { message: errorData.error || "Printer unavailable" },
                  ts: Date.now(),
                });
              }
            })
            .catch((error) => {
              console.error("Printer status fetch error:", error);
              emit({
                type: "panel.update",
                panel: "printer_error",
                payload: { message: "Printer offline or unreachable" },
                ts: Date.now(),
              });
            })
        );

        // Execute all API calls in parallel
        await Promise.allSettled(promises);

        // Update Camera (from state) - synchronous, no API call needed
        emit({
          type: "panel.update",
          panel: "camera",
          payload: { enabled: state.cameraEnabled },
          ts: Date.now(),
        });
      } catch (error) {
        console.error("Panel update error:", error);
      } finally {
        isUpdatingRef.current = false;
      }
    };

    // Defer initial update slightly to allow page to render first
    // Use requestIdleCallback if available, otherwise setTimeout
    let initialUpdateIdleCallback: number | null = null;
    let initialUpdateTimeout: NodeJS.Timeout | null = null;
    
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      initialUpdateIdleCallback = window.requestIdleCallback(
        () => updatePanels(),
        { timeout: 200 } // Start after 200ms even if not idle
      );
    } else {
      // Fallback: delay by 150ms (reduced from 750ms for faster startup)
      initialUpdateTimeout = setTimeout(updatePanels, 150);
    }

    // Set up interval for subsequent updates
    const interval = setInterval(updatePanels, INTERVALS.PANEL_UPDATE_MS);

    return () => {
      if (initialUpdateIdleCallback !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(initialUpdateIdleCallback);
      }
      if (initialUpdateTimeout !== null) {
        clearTimeout(initialUpdateTimeout);
      }
      clearInterval(interval);
    };
  }, [emit, state.sessionStartTime, state.commandsCount, state.cameraEnabled, userLocation, lastWeatherUpdate]);
}

