use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use enigo::{Enigo, Key, Keyboard, Settings, Direction};
use once_cell::sync::Lazy;

use crate::src_tauri::input_parser::ButtonState;
use crate::src_tauri::steam_controller::SteamControllerManager;

pub struct MapperState {
    pub is_running: bool,
    pub profile: Profile,
    pub thread_spawned: bool,
}

#[derive(Clone, Default)]
pub struct Profile {
    pub map_a_to_space: bool,
}

static MAPPER_STATE: Lazy<Arc<Mutex<MapperState>>> = Lazy::new(|| {
    Arc::new(Mutex::new(MapperState {
        is_running: false,
        profile: Profile { map_a_to_space: true },
        thread_spawned: false,
    }))
});

pub fn start_mapper(sc_manager: Arc<Mutex<Option<SteamControllerManager>>>) {
    let mut state = MAPPER_STATE.lock().unwrap();
    
    // Only spawn the thread once
    if state.thread_spawned {
        state.is_running = true;
        return;
    }
    
    state.thread_spawned = true;
    state.is_running = true;
    
    let state_clone = MAPPER_STATE.clone();
    
    thread::spawn(move || {
        // Enigo initialization can sometimes be tricky on Windows depending on the backend,
        // but it should work fine inside a thread.
        let mut enigo = Enigo::new(&Settings::default()).unwrap();
        let mut last_state = ButtonState::default();

        loop {
            // Check if mapper is requested to run
            let is_running = {
                state_clone.lock().unwrap().is_running
            };

            if !is_running {
                thread::sleep(Duration::from_millis(50));
                continue;
            }

            // High frequency polling (~250Hz, sleep 2-4ms before checking again if no data)
            // The read itself might block for 10ms if there is no data
            let input_opt = {
                // Lock the manager just long enough to get the device handle
                let manager_guard = sc_manager.lock().unwrap();
                if let Some(m) = manager_guard.as_ref() {
                    // Extract the device clone so we can release the main manager lock
                    Some(m.get_device())
                } else {
                    None
                }
            }; // manager_guard is dropped here!

            if let Some(device_arc) = input_opt {
                // Now read from the device without holding the SC_MANAGER lock!
                // Read directly from the device to avoid deadlocks
                let device_guard = device_arc.lock().unwrap();
                if let Some(device) = device_guard.as_ref() {
                    let mut latest_buf = None;
                    let mut buf = vec![0u8; 64];

                    // Drain the entire queue to eliminate latency
                    loop {
                        match device.read_timeout(&mut buf, 10) {
                            Ok(size) if size > 0 => {
                                let mut valid_buf = buf.clone();
                                valid_buf.truncate(size);
                                latest_buf = Some(valid_buf);
                            }
                            Ok(_) => break, // Queue is drained
                            Err(_) => break,
                        }
                    }

                    if let Some(buf) = latest_buf {
                        if let Ok(input) = crate::src_tauri::input_parser::parse_input_report(&buf) {
                                let profile = {
                                    state_clone.lock().unwrap().profile.clone()
                                };

                                // Execute mapping based on changes
                                // Button A -> Space
                                if profile.map_a_to_space {
                                    if input.buttons.a && !last_state.a {
                                        let _ = enigo.key(Key::Space, Direction::Press);
                                    } else if !input.buttons.a && last_state.a {
                                        let _ = enigo.key(Key::Space, Direction::Release);
                                    }
                                }

                                // Store last state
                                last_state = input.buttons;
                            }
                        }
                    }
                }
            }

            // Tiny sleep to avoid pegging a CPU core at 100% when no controller is connected
            thread::sleep(Duration::from_millis(2));
        }
    });
}

pub fn set_mapper_running(running: bool) {
    let mut state = MAPPER_STATE.lock().unwrap();
    state.is_running = running;
}
