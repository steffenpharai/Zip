"use client";

import { useEffect, useState } from "react";
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
          timeout: 15000, // Increased timeout to 15 seconds
          maximumAge: 0, // Don't use cached location - always get fresh
        }
      );
    } else if (typeof navigator !== "undefined" && !navigator.geolocation) {
      console.warn("Geolocation API not available in this browser");
      setLocationError("Geolocation not supported");
    }
  }, [locationRequested]);

  useEffect(() => {
    const updatePanels = async () => {
      try {
        // Update System Stats
        const systemResponse = await fetch("/api/tools/get_system_stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (systemResponse.ok) {
          const { result } = await systemResponse.json();
          emit({
            type: "panel.update",
            panel: "system",
            payload: result,
            ts: Date.now(),
          });
        }

        // Update Weather with user's location if available
        // Only update weather every 5 minutes to reduce API calls (weather doesn't change that quickly)
        const now = Date.now();
        const timeSinceLastWeatherUpdate = now - lastWeatherUpdate;
        const shouldUpdateWeather = timeSinceLastWeatherUpdate >= INTERVALS.WEATHER_UPDATE_MS || lastWeatherUpdate === 0;

        if (shouldUpdateWeather && userLocation) {
          const weatherBody = { lat: userLocation.lat, lon: userLocation.lon };
          const weatherResponse = await fetch("/api/tools/get_weather", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(weatherBody),
          });
          if (weatherResponse.ok) {
            const { result } = await weatherResponse.json();
            emit({
              type: "panel.update",
              panel: "weather",
              payload: result,
              ts: Date.now(),
            });
            setLastWeatherUpdate(now);
          }
        }

        // Update Uptime
        const uptimeResponse = await fetch("/api/tools/get_uptime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionStartTime: state.sessionStartTime,
            commandsCount: state.commandsCount,
          }),
        });
        if (uptimeResponse.ok) {
          const { result } = await uptimeResponse.json();
          emit({
            type: "panel.update",
            panel: "uptime",
            payload: result,
            ts: Date.now(),
          });
        }

        // Update Camera (from state)
        emit({
          type: "panel.update",
          panel: "camera",
          payload: { enabled: state.cameraEnabled },
          ts: Date.now(),
        });
      } catch (error) {
        console.error("Panel update error:", error);
      }
    };

    // Initial update
    updatePanels();

    // Set up interval
    const interval = setInterval(updatePanels, INTERVALS.PANEL_UPDATE_MS);

    return () => clearInterval(interval);
  }, [emit, state.sessionStartTime, state.commandsCount, state.cameraEnabled, userLocation]);
}

