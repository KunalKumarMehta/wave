use tauri::Manager;
use tauri::tray::{TrayIconBuilder, MouseButton};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri::webview::WebviewBuilder;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You are in the desktop app.", name)
}

#[tauri::command]
async fn navigate_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        let parsed_url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
        webview.navigate(parsed_url).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Browser webview not found".into())
    }
}

#[tauri::command]
fn get_browser_url(app: tauri::AppHandle) -> String {
    if let Some(webview) = app.get_webview("browser") {
        webview.url().map(|u| u.to_string()).unwrap_or_default()
    } else {
        String::new()
    }
}

#[tauri::command]
fn set_browser_bounds(app: tauri::AppHandle, x: i32, y: i32, width: u32, height: u32) {
    if let Some(webview) = app.get_webview("browser") {
        let _ = webview.set_bounds(tauri::Rect { x, y, width, height });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            // For now, any global shortcut toggles the window
            if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
    }).build())
    .invoke_handler(tauri::generate_handler![greet, navigate_browser, get_browser_url, set_browser_bounds])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Create browser webview attached to main window
      let main_window = app.get_webview_window("main").unwrap();
      
      let _browser = WebviewBuilder::new("browser", tauri::WebviewUrl::App("about:blank".parse().unwrap()))
        .build(&main_window)?;

      // Add tray icon
      let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                if button == MouseButton::Left {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        })
        .build(app)?;

      // Register a default global shortcut (e.g. Cmd+Shift+Space on mac)
      let app_handle = app.handle();
      let shortcut: tauri_plugin_global_shortcut::Shortcut = "CmdOrControl+Shift+Space".parse().unwrap();
      if let Err(e) = app_handle.global_shortcut().register(shortcut) {
          println!("Could not register global shortcut: {:?}", e);
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
