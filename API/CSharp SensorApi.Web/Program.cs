using Microsoft.Data.SqlClient;
using SensorApi.Web;
using SensorApi.Web.Components;

var builder = WebApplication.CreateBuilder(args);

// Add service defaults & Aspire client integrations.
builder.AddServiceDefaults();

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddOutputCache();

builder.Services.AddHttpClient<WeatherApiClient>(client =>
{
    // This URL uses "https+http://" to indicate HTTPS is preferred over HTTP.
    // Learn more about service discovery scheme resolution at https://aka.ms/dotnet/sdschemes.
    client.BaseAddress = new("https+http://apiservice");
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseAntiforgery();

app.UseOutputCache();

app.MapStaticAssets();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.MapDefaultEndpoints();

// Endpoint to retrieve the most recent sensor reading.
app.MapGet("/getCurrent", async (IConfiguration config) =>
{
    var connectionString = config.GetConnectionString("AzureSql");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Problem("Database connection string is not configured.", statusCode: 500);
    }

    var readings = new List<SensorReading>();

    try
    {
        // Use await using to dispose the connection asynchronously.
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        
        await using var command = new SqlCommand("SELECT TOP 1 Temperature, Humidity, Date FROM SensorTable ORDER BY Date DESC;", connection);
        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            // Check for DBNull to avoid exceptions if columns are null.
            double temperature = !reader.IsDBNull(0) ? reader.GetDouble(0) : 0.0;
            double humidity = !reader.IsDBNull(1) ? reader.GetDouble(1) : 0.0;
            DateTime date = reader.IsDBNull(2) ? DateTime.MinValue : reader.GetDateTime(2);

            readings.Add(new SensorReading
            {
                Temperature = temperature,
                Humidity = humidity,
                Date = date
            });
        }

        return Results.Ok(readings);
    }
    catch (SqlException ex)
    {
        // Log exception details as needed
        Console.Error.WriteLine($"SQL Error: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 500);
    }
    catch (Exception ex)
    {
        // Log unexpected exceptions
        Console.Error.WriteLine($"Unexpected Error: {ex.Message}");
        return Results.Problem("An unexpected error occurred.", statusCode: 500);
    }
});

// Endpoint for inserting a new sensor reading.
app.MapPost("/data/insert", async (IConfiguration config, SensorReading reading) =>
{
    var connectionString = config.GetConnectionString("AzureSql");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Problem("Database connection string is not configured.", statusCode: 500);
    }

    if (reading == null)
    {
        return Results.BadRequest("Sensor reading data is required.");
    }

    try
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        
        var query = "INSERT INTO SensorTable (Temperature, Humidity, Date) VALUES (@temperature, @humidity, @date)";
        await using var command = new SqlCommand(query, connection);
        command.Parameters.AddWithValue("@temperature", reading.Temperature);
        command.Parameters.AddWithValue("@humidity", reading.Humidity);
        command.Parameters.AddWithValue("@date", reading.Date);

        var rowsAffected = await command.ExecuteNonQueryAsync();
        return rowsAffected > 0 ? Results.Ok("Insertion successful.") : Results.Problem("Insertion failed.", statusCode: 500);
    }
    catch (SqlException ex)
    {
        Console.Error.WriteLine($"SQL Error: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 500);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unexpected Error: {ex.Message}");
        return Results.Problem("An unexpected error occurred.", statusCode: 500);
    }
});

// Endpoint for querying sensor readings within a date range filtered by a minimal interval (in seconds).
app.MapGet("/data/query", async (IConfiguration config, DateTime start, DateTime end, int interval) =>
{
    var connectionString = config.GetConnectionString("AzureSql");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Problem("Database connection string is not configured.", statusCode: 500);
    }

    if (interval <= 0)
    {
        return Results.BadRequest("Interval must be a positive integer (in seconds).");
    }

    var readings = new List<SensorReading>();

    try
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        
        var query = "SELECT Temperature, Humidity, Date FROM SensorTable WHERE Date BETWEEN @start AND @end ORDER BY Date ASC";
        await using var command = new SqlCommand(query, connection);
        command.Parameters.AddWithValue("@start", start);
        command.Parameters.AddWithValue("@end", end);

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            double temperature = !reader.IsDBNull(0) ? reader.GetDouble(0) : 0.0;
            double humidity = !reader.IsDBNull(1) ? reader.GetDouble(1) : 0.0;
            DateTime date = reader.IsDBNull(2) ? DateTime.MinValue : reader.GetDateTime(2);

            readings.Add(new SensorReading
            {
                Temperature = temperature,
                Humidity = humidity,
                Date = date
            });
        }

        // Apply interval filtering: include first reading and only readings that differ by at least `interval` seconds.
        var filteredReadings = new List<SensorReading>();
        SensorReading lastIncluded = null;
        foreach (var reading in readings)
        {
            if (lastIncluded is null || (reading.Date - lastIncluded.Date).TotalSeconds >= interval)
            {
                filteredReadings.Add(reading);
                lastIncluded = reading;
            }
        }
        
        return Results.Ok(filteredReadings);
    }
    catch (SqlException ex)
    {
        Console.Error.WriteLine($"SQL Error: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 500);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unexpected Error: {ex.Message}");
        return Results.Problem("An unexpected error occurred.", statusCode: 500);
    }
});

app.Run();

public class SensorReading
{
    public double Temperature { get; set; }
    public double Humidity { get; set; }
    public DateTime Date { get; set; }
}