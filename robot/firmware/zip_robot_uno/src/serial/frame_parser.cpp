/*
 * JSON Frame Parser Implementation
 * 
 * Production-grade parser with:
 * - Ring buffer for robust RX handling
 * - JSON termination on '}' (official ELEGOO style)
 * - Binary protocol detection (0xAA 0x55)
 * - Resync on long lines
 * - Diagnostic counters
 */

#include "frame_parser.h"
#include <ArduinoJson.h>
#include <avr/wdt.h>

// Global diagnostic counters
ParseStats g_parseStats = {0, 0, 0, 0, 0, 0};

FrameParser::FrameParser()
  : head(0)
  , tail(0)
  , jsonPos(0)
  , state(STATE_IDLE)
  , isBinary(false)
{
  reset();
}

void FrameParser::reset() {
  state = STATE_IDLE;
  jsonPos = 0;
  jsonBuffer[0] = '\0';
  isBinary = false;
  lastCommand.valid = false;
  lastCommand.N = -1;
  lastCommand.H[0] = '\0';
  lastCommand.D1 = 0;
  lastCommand.D2 = 0;
  lastCommand.D3 = 0;
  lastCommand.D4 = 0;
  lastCommand.T = 0;
  // Don't clear ring buffer on reset - may have pending data
}

// Ring buffer push (returns false if full)
bool FrameParser::ringPush(uint8_t byte) {
  uint8_t nextHead = (head + 1) & (RING_SIZE - 1);  // Power of 2 modulo
  if (nextHead == tail) {
    // Buffer full - overflow
    g_parseStats.rx_overflow++;
    return false;
  }
  ring[head] = byte;
  head = nextHead;
  return true;
}

// Ring buffer pop (returns false if empty)
bool FrameParser::ringPop(uint8_t& byte) {
  if (head == tail) {
    return false;  // Empty
  }
  byte = ring[tail];
  tail = (tail + 1) & (RING_SIZE - 1);
  return true;
}

// Ring buffer available count
uint8_t FrameParser::ringAvailable() const {
  return (head - tail) & (RING_SIZE - 1);
}

// Clear ring buffer
void FrameParser::ringClear() {
  head = 0;
  tail = 0;
}

// Resync: discard bytes until newline or clear buffer
void FrameParser::resyncToNewline() {
  uint8_t byte;
  while (ringPop(byte)) {
    if (byte == '\n' || byte == '\r') {
      break;  // Found line terminator, ready for next frame
    }
  }
  state = STATE_IDLE;
  jsonPos = 0;
}

bool FrameParser::processByte(uint8_t byte) {
  // Handle state machine
  switch (state) {
    case STATE_IDLE:
      // Look for frame start
      if (byte == '{') {
        // JSON frame start
        jsonBuffer[0] = '{';
        jsonPos = 1;
        state = STATE_JSON_READING;
        isBinary = false;
      } else if (byte == 0xAA) {
        // Potential binary protocol start
        // Let caller handle binary via protocol decoder
        isBinary = true;
        state = STATE_BINARY_HEADER;
        return false;  // Caller should use binary decoder
      }
      // Ignore other characters (whitespace, newlines between frames)
      return false;
      
    case STATE_JSON_READING:
      // Accumulate JSON until '}'
      if (byte == '}') {
        // End of JSON frame
        if (jsonPos < MAX_JSON_LINE) {
          jsonBuffer[jsonPos++] = '}';
          jsonBuffer[jsonPos] = '\0';
          state = STATE_JSON_COMPLETE;
          return parseJson();
        } else {
          // Line too long even at terminator
          g_parseStats.json_dropped_long++;
          state = STATE_IDLE;
          jsonPos = 0;
          return false;
        }
      } else if (byte == '\n' || byte == '\r') {
        // Newline before '}' - treat as frame terminator for compatibility
        // Some hosts may send newline-terminated JSON
        if (jsonPos > 1) {
          // Try to parse what we have if it looks complete
          jsonBuffer[jsonPos] = '\0';
          // Check if last char is '}' (might have been missed)
          if (jsonPos > 0 && jsonBuffer[jsonPos - 1] == '}') {
            state = STATE_JSON_COMPLETE;
            return parseJson();
          }
        }
        // Incomplete frame - discard and wait for new frame
        state = STATE_IDLE;
        jsonPos = 0;
        return false;
      } else if (byte == '{') {
        // New frame start in middle of old frame - discard old and start fresh
        jsonBuffer[0] = '{';
        jsonPos = 1;
        // Stay in reading state
        return false;
      } else {
        // Accumulate character
        if (jsonPos < MAX_JSON_LINE) {
          jsonBuffer[jsonPos++] = (char)byte;
        } else {
          // Line too long - discard and resync
          g_parseStats.json_dropped_long++;
          state = STATE_IDLE;
          jsonPos = 0;
          // Consume until newline to resync
          return false;
        }
      }
      return false;
      
    case STATE_BINARY_HEADER:
      // Binary protocol - return immediately so caller uses binary decoder
      isBinary = true;
      state = STATE_IDLE;
      return false;
      
    case STATE_JSON_COMPLETE:
      // Should not receive bytes in complete state - reset
      state = STATE_IDLE;
      jsonPos = 0;
      return false;
  }
  
  return false;
}

bool FrameParser::parseJson() {
  // Reset watchdog before parsing
  wdt_reset();
  
  // Use minimal StaticJsonDocument (commands are simple)
  // Typical command: {"N":200,"H":"cmd","D1":100,"D2":50,"T":200}
  // ~50 bytes, so 96 byte document is sufficient
  StaticJsonDocument<96> doc;
  DeserializationError error = deserializeJson(doc, jsonBuffer);
  
  if (error) {
    g_parseStats.parse_errors++;
    state = STATE_IDLE;
    jsonPos = 0;
    return false;
  }
  
  // Extract command fields
  if (!doc.containsKey(F("N"))) {
    g_parseStats.parse_errors++;
    state = STATE_IDLE;
    jsonPos = 0;
    return false;
  }
  
  lastCommand.N = doc[F("N")].as<int>();
  
  // Extract H (header/serial number)
  if (doc.containsKey(F("H"))) {
    const char* h = doc[F("H")].as<const char*>();
    if (h) {
      strncpy(lastCommand.H, h, sizeof(lastCommand.H) - 1);
      lastCommand.H[sizeof(lastCommand.H) - 1] = '\0';
    } else {
      lastCommand.H[0] = '\0';
    }
  } else {
    lastCommand.H[0] = '\0';
  }
  
  // Extract data fields (default to 0)
  lastCommand.D1 = doc.containsKey(F("D1")) ? doc[F("D1")].as<int>() : 0;
  lastCommand.D2 = doc.containsKey(F("D2")) ? doc[F("D2")].as<int>() : 0;
  lastCommand.D3 = doc.containsKey(F("D3")) ? doc[F("D3")].as<int>() : 0;
  lastCommand.D4 = doc.containsKey(F("D4")) ? doc[F("D4")].as<int>() : 0;
  lastCommand.T = doc.containsKey(F("T")) ? doc[F("T")].as<unsigned long>() : 0;
  
  lastCommand.valid = (lastCommand.N >= 0);
  
  // Update stats
  if (lastCommand.valid) {
    g_parseStats.last_cmd_ms = millis();
  }
  
  // Reset for next frame
  state = STATE_IDLE;
  jsonPos = 0;
  
  wdt_reset();
  return lastCommand.valid;
}

bool FrameParser::getCommand(ParsedCommand& cmd) {
  if (lastCommand.valid) {
    cmd = lastCommand;
    // Clear valid flag after retrieving
    lastCommand.valid = false;
    return true;
  }
  return false;
}
