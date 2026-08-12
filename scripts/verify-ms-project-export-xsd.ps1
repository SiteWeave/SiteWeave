$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $repoRoot 'tmp'
$fixturePath = Join-Path $tmpDir 'ms-project-export-fixture.xml'
$sourceXsdPath = Join-Path $tmpDir 'mspdi_pj12.xsd'
$normalizedXsdPath = Join-Path $tmpDir 'mspdi-siteweave.xsd'
$schemaUrl = 'https://schemas.microsoft.com/project/2007/mspdi_pj12.xsd'
$documentNamespace = 'http://schemas.microsoft.com/project'
$schemaNamespace = 'http://schemas.microsoft.com/project/2007'

New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

Push-Location $repoRoot
try {
    & node 'scripts/test-ms-project-export.mjs'
    if ($LASTEXITCODE -ne 0) {
        throw 'MS Project export fixture tests failed.'
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $sourceXsdPath)) {
    Write-Host 'Downloading the Microsoft Project 2007 MSPDI schema...'
    Invoke-WebRequest -Uri $schemaUrl -OutFile $sourceXsdPath
}

# Microsoft Project files use the stable, unversioned document namespace.
# The published Project 2007 XSD uses a versioned target namespace, so normalize
# only that namespace identifier before validating the otherwise unchanged XSD.
$xsd = Get-Content $sourceXsdPath -Raw
$xsd = $xsd.Replace($schemaNamespace, $documentNamespace)
Set-Content $normalizedXsdPath $xsd -Encoding UTF8

$schemas = [System.Xml.Schema.XmlSchemaSet]::new()
$schemas.Add($documentNamespace, $normalizedXsdPath) | Out-Null

$settings = [System.Xml.XmlReaderSettings]::new()
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.Schemas = $schemas

$validationErrors = [System.Collections.Generic.List[string]]::new()
$handler = [System.Xml.Schema.ValidationEventHandler] {
    param($sender, $eventArgs)
    $validationErrors.Add($eventArgs.Message)
}
$settings.add_ValidationEventHandler($handler)

$reader = [System.Xml.XmlReader]::Create($fixturePath, $settings)
try {
    while ($reader.Read()) {
        # Reading the complete document triggers schema validation.
    }
}
finally {
    $reader.Dispose()
}

if ($validationErrors.Count -gt 0) {
    $validationErrors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host 'Microsoft Project XML passed MSPDI XSD validation.'
