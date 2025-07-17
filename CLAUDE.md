# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based controller for FlexiSpot standing desks using the Web Serial API. It's a client-side JavaScript application that communicates directly with FlexiSpot desks through USB-Serial adapters.

## Development Commands

Since this is a static web application, there are no build tools or package managers. To run the project:

```bash
# For local development (HTTPS required for Web Serial API)
python -m http.server 8000 --bind 127.0.0.1
# or
npx http-server-ssl -p 8000

# Access at: https://localhost:8000
```

## Architecture

### Core Components

1. **FlexiSpotController** (`script.js`): Main application controller
   - Manages UI state and user interactions
   - Handles keyboard shortcuts (↑↓ for UP/DOWN, 1/2 for presets, S for sitting, T for standing)
   - Coordinates between UI and serial communication
   - Implements preset management with active state tracking

2. **FlexiSpotSerial** (`serial-protocol.js`): Serial communication handler
   - Manages Web Serial API connection lifecycle
   - Implements FlexiSpot protocol commands
   - Handles continuous command sending for UP/DOWN controls
   - Includes buffer overrun protection for stable communication

3. **UI Components** (`index.html`, `styles.css`):
   - Modern responsive design with gradient backgrounds
   - Connection status indicators
   - Preset and manual control buttons
   - Error modal system
   - Version info display

### Communication Protocol

The application uses specific byte sequences to communicate with FlexiSpot desks:

- **Baud Rate**: 9600 bps
- **Command Structure**: 8-byte arrays starting with [0x9b, 0x06, 0x02, ...]
- **UP**: `[0x9b, 0x06, 0x02, 0x01, 0x00, 0xfc, 0xa0, 0x9d]`
- **DOWN**: `[0x9b, 0x06, 0x02, 0x02, 0x00, 0x0c, 0xa0, 0x9d]`
- **PRESET1**: `[0x9b, 0x06, 0x02, 0x04, 0x00, 0xac, 0xa3, 0x9d]`
- **PRESET2**: `[0x9b, 0x06, 0x02, 0x08, 0x00, 0xac, 0xa6, 0x9d]`
- **SITTING**: `[0x9b, 0x06, 0x02, 0x00, 0x01, 0xac, 0x60, 0x9d]`
- **STANDING**: `[0x9b, 0x06, 0x02, 0x10, 0x00, 0xac, 0xac, 0x9d]`

### Key Features

1. **Continuous Commands**: UP/DOWN buttons send commands every 108ms while pressed
2. **Preset Toggle**: Preset buttons can start/stop movement by clicking again
3. **Buffer Management**: Automatic buffer clearing to prevent overrun errors
4. **Error Handling**: Comprehensive error handling with user-friendly messages
5. **State Management**: Tracks active presets and connection status
6. **Keyboard Shortcuts**: Full keyboard control for accessibility

## Development Guidelines

### When working with this codebase:

1. **Serial Communication**: Always test changes with actual hardware or handle gracefully when no device is connected
2. **Error Handling**: Maintain robust error handling as Web Serial API can be unstable
3. **State Management**: Keep UI state in sync with actual device state
4. **Buffer Management**: Be careful with continuous commands to avoid buffer overruns
5. **Browser Compatibility**: Code targets Chrome/Edge 89+ with Web Serial API support

### File Structure

```
flexispot-web-controller/
├── index.html              # Main HTML page
├── script.js               # Main application logic (FlexiSpotController)
├── serial-protocol.js      # Serial communication (FlexiSpotSerial)
├── styles.css              # CSS styling
└── README.md               # Project documentation
```

### Testing

This application requires:
- Chrome/Edge 89+ browser
- HTTPS environment
- Physical FlexiSpot desk with USB-Serial adapter
- User interaction to grant serial port access

No automated tests are available due to hardware dependency.

## Important Notes

- Web Serial API requires HTTPS and user permission
- Commands must be sent at correct intervals to avoid overwhelming the desk
- Buffer overrun protection is critical for stable operation
- The application uses localStorage for preset persistence
- All UI text is in Japanese as per the target audience