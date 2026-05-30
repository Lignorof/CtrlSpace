import { invoke } from '@tauri-apps/api/tauri';
import { useMemo, useState, useEffect } from 'react';
import './styles/index.css';

interface SteamControllerInfo {
  connected: boolean;
  connection_type: string;
  product_name: string;
  serial: string;
}

interface ButtonState {
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  lb: boolean;
  rb: boolean;
  lt: boolean;
  rt: boolean;
  lgrip: boolean;
  rgrip: boolean;
  start: boolean;
  select: boolean;
  steam: boolean;
  lpad_click: boolean;
  rpad_click: boolean;
  stick_click: boolean;
}

interface TrackpadData {
  x: number;
  y: number;
  active: boolean;
}

interface StickData {
  x: number;
  y: number;
}

interface TriggersData {
  left: number;
  right: number;
}

interface GyroData {
  pitch: number;
  yaw: number;
  roll: number;
}

interface ControllerInput {
  buttons: ButtonState;
  left_trackpad: TrackpadData;
  right_trackpad: TrackpadData;
  stick: StickData;
  triggers: TriggersData;
  gyro: GyroData;
  timestamp: number;
}

function App() {
  const [controllerInfo, setControllerInfo] = useState<SteamControllerInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string>('');
  const [input, setInput] = useState<ControllerInput | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isMapperRunning, setIsMapperRunning] = useState(false);

  useEffect(() => {
    const blockSteamInput = (event: WheelEvent | KeyboardEvent | MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('wheel', blockSteamInput, { passive: false, capture: true });
    window.addEventListener('keydown', blockSteamInput, { capture: true });
    window.addEventListener('contextmenu', blockSteamInput, { capture: true });
    window.addEventListener('auxclick', blockSteamInput, { capture: true });
    return () => {
      window.removeEventListener('wheel', blockSteamInput, { capture: true });
      window.removeEventListener('keydown', blockSteamInput, { capture: true });
      window.removeEventListener('contextmenu', blockSteamInput, { capture: true });
      window.removeEventListener('auxclick', blockSteamInput, { capture: true });
    };
  }, []);

  // Check connection status periodically
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await invoke<boolean>('is_steam_controller_connected');
        setIsConnected(connected);
      } catch (e) {
        console.error('Failed to check connection:', e);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  // Input polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let isFetching = false;
    // Do not poll if mapper is running, otherwise they steal packets from each other!
    if (isConnected && isPolling && !isMapperRunning) {
      interval = setInterval(async () => {
        if (isFetching) return;
        isFetching = true;
        try {
          const data = await invoke<ControllerInput>('read_controller_input');
          setInput(data);
          setError(''); // Clear error on successful read
        } catch (e) {
          const errorMsg = String(e);
          // Silently ignore "No data available" errors
          if (!errorMsg.includes('No data available')) {
            console.error("Failed to read input:", e);
            setError(errorMsg);
          }
        } finally {
          isFetching = false;
        }
      }, 30); // ~33Hz for minimal latency
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected, isPolling, isMapperRunning]);

  const detectController = async () => {
    try {
      const info = await invoke<SteamControllerInfo | null>('detect_steam_controller');
      setControllerInfo(info);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  const connectController = async () => {
    try {
      const info = await invoke<SteamControllerInfo>('connect_steam_controller');
      setControllerInfo(info);
      setIsConnected(true);
      setIsPolling(true); // Re-enabled auto-polling with reduced timeout (50ms backend)
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  const disconnectController = async () => {
    try {
      await invoke('disconnect_steam_controller');
      setIsConnected(false);
      setIsPolling(false);
      setInput(null);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleMapper = async () => {
    try {
      if (isMapperRunning) {
        await invoke('stop_mapper');
        setIsMapperRunning(false);
      } else {
        await invoke('start_mapper');
        setIsMapperRunning(true);
      }
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };


  const testRawInput = async () => {
    try {
      const rawData = await invoke<string>('read_raw_input_debug');
      console.log('✅ Raw Input Data:');
      console.log(rawData);
      setError('Raw data logged to console (F12)');
    } catch (e) {
      console.error('❌ Error reading raw input:', e);
      setError(String(e));
    }
  };

  const listInterfaces = async () => {
    try {
      const interfaces = await invoke<any[]>('list_steam_controller_interfaces');
      console.log('🔍 Steam Controller HID Interfaces:');
      console.table(interfaces);
      setError(`Found ${interfaces.length} interfaces - check console (F12)`);
    } catch (e) {
      console.error('❌ Error listing interfaces:', e);
      setError(String(e));
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-900 text-white p-3">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-3 text-center">
          🎮 CtrlSpace - Steam Controller Manager
        </h1>

        {/* Connection Status */}
        <div className="bg-gray-800 rounded-lg p-3 mb-3">
          <h2 className="text-lg font-semibold mb-2">Connection Status</h2>

          <div className="flex items-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <button
              onClick={detectController}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              Detect Controller
            </button>
            <button
              onClick={connectController}
              disabled={isConnected}
              className={`px-3 py-1.5 rounded transition ${
                isConnected
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              Connect
            </button>
            <button
              onClick={disconnectController}
              disabled={!isConnected}
              className={`px-3 py-1.5 rounded transition ${
                !isConnected
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              Disconnect
            </button>
            <button
              onClick={testRawInput}
              disabled={!isConnected}
              className={`px-3 py-1.5 rounded transition ${
                !isConnected
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
            >
              🐛 Debug Raw Input
            </button>
            <button
              onClick={listInterfaces}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded transition"
            >
              🔍 List HID Interfaces
            </button>
            <button
              onClick={toggleMapper}
              disabled={!isConnected}
              className={`px-3 py-1.5 rounded transition font-bold ${
                !isConnected
                  ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                  : isMapperRunning 
                    ? 'bg-red-600 hover:bg-red-700 border-2 border-red-400' 
                    : 'bg-green-600 hover:bg-green-700 border-2 border-green-500'
              }`}
            >
              {isMapperRunning ? '⏹ Stop Mapper' : '▶ Start Mapper'}
            </button>
          </div>

          {controllerInfo && (
            <div className="mt-2 p-2 bg-gray-700 rounded text-xs">
              <p><strong>Product:</strong> {controllerInfo.product_name}</p>
              <p><strong>Connection:</strong> {controllerInfo.connection_type}</p>
              <p><strong>Serial:</strong> {controllerInfo.serial}</p>
            </div>
          )}

          {error && (
            <div className="mt-2 p-2 bg-red-900 border border-red-600 rounded text-xs">
              <p className="text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Input Debug View */}
        {isConnected && (
          <div className="bg-gray-800 rounded-lg p-3">
            <h2 className="text-lg font-semibold mb-2">Input Debug View</h2>

            {input ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {/* Buttons */}
                <div className="bg-gray-700 rounded p-3">
                  <h3 className="text-base font-semibold mb-2">Buttons</h3>
                  <div className="grid grid-cols-4 gap-1.5 text-xs">
                    <ButtonIndicator label="A" active={input.buttons.a} />
                    <ButtonIndicator label="B" active={input.buttons.b} />
                    <ButtonIndicator label="X" active={input.buttons.x} />
                    <ButtonIndicator label="Y" active={input.buttons.y} />
                    <ButtonIndicator label="LB" active={input.buttons.lb} />
                    <ButtonIndicator label="RB" active={input.buttons.rb} />
                    <ButtonIndicator label="LT" active={input.buttons.lt} />
                    <ButtonIndicator label="RT" active={input.buttons.rt} />
                    <ButtonIndicator label="L-Grip" active={input.buttons.lgrip} />
                    <ButtonIndicator label="R-Grip" active={input.buttons.rgrip} />
                    <ButtonIndicator label="Start" active={input.buttons.start} />
                    <ButtonIndicator label="Select" active={input.buttons.select} />
                    <ButtonIndicator label="Steam" active={input.buttons.steam} />
                    <ButtonIndicator label="L-Pad Click" active={input.buttons.lpad_click} />
                    <ButtonIndicator label="R-Pad Click" active={input.buttons.rpad_click} />
                    <ButtonIndicator label="Stick Click" active={input.buttons.stick_click} />
                  </div>
                </div>

                {/* Analog Inputs */}
                <div className="bg-gray-700 rounded p-3">
                  <h3 className="text-base font-semibold mb-2">Analog Triggers</h3>
                  <div className="space-y-1">
                    <ProgressBar label="Left Trigger" value={input.triggers.left} max={255} />
                    <ProgressBar label="Right Trigger" value={input.triggers.right} max={255} />
                  </div>
                </div>

                {/* Stick */}
                <div className="bg-gray-700 rounded p-3">
                  <h3 className="text-base font-semibold mb-2">Analog Stick</h3>
                  <p className="text-sm">X: {input.stick.x}</p>
                  <p className="text-sm">Y: {input.stick.y}</p>
                  <div className="mt-1 w-full h-24 bg-gray-900 rounded relative">
                    <StickVisualizer x={input.stick.x} y={input.stick.y} />
                  </div>
                </div>

                {/* Left Trackpad */}
                <div className="bg-gray-700 rounded p-3">
                  <h3 className="text-base font-semibold mb-2">Left Trackpad</h3>
                  <p className="text-sm">X: {input.left_trackpad.x}</p>
                  <p className="text-sm">Y: {input.left_trackpad.y}</p>
                  <p className="text-sm">Active: {input.left_trackpad.active ? 'Yes' : 'No'}</p>
                  <div className="mt-1 w-full h-24 bg-gray-900 rounded relative">
                    <TrackpadVisualizer data={input.left_trackpad} />
                  </div>
                </div>

                {/* Right Trackpad */}
                <div className="bg-gray-700 rounded p-3">
                  <h3 className="text-base font-semibold mb-2">Right Trackpad</h3>
                  <p className="text-sm">X: {input.right_trackpad.x}</p>
                  <p className="text-sm">Y: {input.right_trackpad.y}</p>
                  <p className="text-sm">Active: {input.right_trackpad.active ? 'Yes' : 'No'}</p>
                  <div className="mt-1 w-full h-24 bg-gray-900 rounded relative">
                    <TrackpadVisualizer data={input.right_trackpad} />
                  </div>
                </div>

                {/* Gyro */}
                <div className="bg-gray-700 rounded p-3">
                  <h3 className="text-base font-semibold mb-2">Gyroscope</h3>
                  <p className="text-sm">Pitch: {input.gyro.pitch}</p>
                  <p className="text-sm">Yaw: {input.gyro.yaw}</p>
                  <p className="text-sm">Roll: {input.gyro.roll}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Waiting for input data...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components
function ButtonIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`px-3 py-2 rounded text-center ${active ? 'bg-green-600' : 'bg-gray-600'}`}>
      {label}
    </div>
  );
}

function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = (value / max) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="w-full bg-gray-900 rounded h-4">
        <div
          className="bg-blue-600 h-4 rounded transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StickVisualizer({ x, y }: { x: number; y: number }) {
  const { xPercent, yPercent } = useMemo(() => normalizePoint(x, y), [x, y]);

  return (
    <div
      className="absolute w-4 h-4 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75 ease-out will-change-[left,top]"
      style={{ left: `${xPercent}%`, top: `${100 - yPercent}%` }}
    />
  );
}

function TrackpadVisualizer({ data }: { data: TrackpadData }) {
  const { xPercent, yPercent } = useMemo(() => normalizePoint(data.x, data.y), [data.x, data.y]);
  if (!data.active) return null;

  return (
    <div
      className="absolute w-3 h-3 bg-blue-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75 ease-out will-change-[left,top]"
      style={{ left: `${xPercent}%`, top: `${100 - yPercent}%` }}
    />
  );
}

function normalizePoint(x: number, y: number) {
  const clamp = (value: number) => Math.max(2, Math.min(98, value));

  return {
    xPercent: clamp(((x + 32768) / 65535) * 100),
    yPercent: clamp(((y + 32768) / 65535) * 100),
  };
}

export default App;
