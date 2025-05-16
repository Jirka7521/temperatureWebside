var builder = DistributedApplication.CreateBuilder(args);

var apiService = builder.AddProject<Projects.SensorApi_ApiService>("apiservice");

builder.AddProject<Projects.SensorApi_Web>("webfrontend")
    .WithExternalHttpEndpoints()
    .WithReference(apiService)
    .WaitFor(apiService);

builder.Build().Run();
