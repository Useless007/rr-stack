fn main() -> Result<(), serde_json::Error> {
    println!("{}", rr_server::openapi().to_pretty_json()?);
    Ok(())
}
