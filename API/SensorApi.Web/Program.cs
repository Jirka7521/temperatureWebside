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

// Read Weather API base address from configuration
var weatherApiBase = builder.Configuration.GetSection("ApiAddresses:WeatherApiBase").Value;
builder.Services.AddHttpClient<WeatherApiClient>(client =>
{
    client.BaseAddress = new(weatherApiBase);
});

// Read CORS allowed origins from configuration
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins ?? Array.Empty<string>())
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Global error handling & HSTS settings when not in development
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseAntiforgery();
app.UseOutputCache();

app.MapStaticAssets();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.MapDefaultEndpoints();

app.UseCors();

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
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();

        // Retrieve the latest sensor reading.
        var query = "SELECT TOP 1 Temperature, Humidity, Date FROM SensorTable ORDER BY Date DESC;";
        await using var command = new SqlCommand(query, connection);
        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            float temperature = !reader.IsDBNull(0) ? (float)reader.GetDouble(0) : 0.0f;
            float humidity = !reader.IsDBNull(1) ? (float)reader.GetDouble(1) : 0.0f;
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
        Console.Error.WriteLine($"SQL Error in /getCurrent: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 500);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unexpected Error in /getCurrent: {ex.Message}");
        return Results.Problem("An unexpected error occurred.", statusCode: 500);
    }
});

// Endpoint for uploading a new sensor reading.
app.MapPost("/upload", async (IConfiguration config, float temperature, float humidity) =>
{
    var connectionString = config.GetConnectionString("AzureSql");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Problem("Database connection string is not configured.", statusCode: 500);
    }

    //Validate input: guard against invalid numeric values.
    if (float.IsNaN(temperature) || float.IsNaN(humidity) ||
        float.IsInfinity(temperature) || float.IsInfinity(humidity))
    {
        return Results.BadRequest(new
        {
            Error = "Invalid temperature or humidity values.",
            Temperature = temperature,
            Humidity = humidity
        });
    }

    // Create a sensor reading with the current UTC date and time.
    SensorReading reading = new SensorReading
    {
        Temperature = temperature,
        Humidity = humidity,
        Date = DateTime.UtcNow
    };

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

        if (rowsAffected <= 0)
        {
            return Results.Problem("Insertion failed.", statusCode: 500);
        }

        return Results.Ok("Insertion successful.");
    }
    catch (SqlException ex)
    {
        Console.Error.WriteLine($"SQL Error in /upload: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 500);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unexpected Error in /upload: {ex.Message}");
        return Results.Problem("An unexpected error occurred.", statusCode: 500);
    }
});

// Endpoint for querying sensor readings within a date range with a minimum interval filter (in seconds).
app.MapGet("/getPast", async (IConfiguration config, DateTime start, DateTime end, int interval) =>
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
            float temperature = !reader.IsDBNull(0) ? (float)reader.GetDouble(0) : 0.0f;
            float humidity = !reader.IsDBNull(1) ? (float)reader.GetDouble(1) : 0.0f;
            DateTime date = reader.IsDBNull(2) ? DateTime.MinValue : reader.GetDateTime(2);

            readings.Add(new SensorReading
            {
                Temperature = temperature,
                Humidity = humidity,
                Date = date
            });
        }

        // Filter readings to ensure a minimum interval between entries.
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
        Console.Error.WriteLine($"SQL Error in /getPast: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 500);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unexpected Error in /getPast: {ex.Message}");
        return Results.Problem("An unexpected error occurred.", statusCode: 500);
    }
});

app.Run();

public class SensorReading
{
    public float Temperature { get; set; }
    public float Humidity { get; set; }
    public DateTime Date { get; set; }
}