fn main() {
    let target = std::env::var("TARGET").expect("Cargo target is unavailable");
    assert_eq!(
        target, "aarch64-apple-darwin",
        "Gitler supports only macOS on Apple Silicon"
    );
    tauri_build::build();
}
