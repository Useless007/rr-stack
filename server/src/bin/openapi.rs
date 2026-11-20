fn main() -> Result<(), serde_json::Error> {
    println!("{}", server::openapi().to_pretty_json()?);
    Ok(())
}
