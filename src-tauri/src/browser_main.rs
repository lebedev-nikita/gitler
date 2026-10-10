fn main() {
    if let Err(error) = gitler_lib::browser::run() {
        eprintln!("Browser bridge failed: {error}");
        std::process::exit(1);
    }
}
