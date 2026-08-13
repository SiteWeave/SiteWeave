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

$xsd = Get-Content $sourceXsdPath -Raw
$xsd = $xsd.Replace($schemaNamespace, $documentNamespace)

# Project 2010+ scheduling fields are read by Microsoft Project but absent from the
# published 2007 XSD. Inject them so SaveVersion 14 exports still validate.
if ($xsd -notmatch 'name="NewTasksAreManual"') {
    $xsd = [regex]::Replace(
        $xsd,
        '(<xsd:element name="NewTasksEstimated"[\s\S]*?</xsd:element>)\s*(<xsd:element name="SplitsInProgressTasks")',
        @'
$1
        <xsd:element name="NewTasksAreManual" type="xsd:boolean" default="true" minOccurs="0">
          <xsd:annotation>
            <xsd:documentation>Whether new tasks are created as manually scheduled.</xsd:documentation>
          </xsd:annotation>
        </xsd:element>
        $2
'@,
        1
    )
}

if ($xsd -notmatch 'name="Manual"') {
    $xsd = [regex]::Replace(
        $xsd,
        '(<xsd:element name="Summary" type="xsd:boolean" minOccurs="0">\s*<xsd:annotation>\s*<xsd:documentation>Whether the task is a summary task\.</xsd:documentation>\s*</xsd:annotation>\s*</xsd:element>)\s*(<xsd:element name="Critical" type="xsd:boolean" minOccurs="0">)',
        @'
$1
                    <xsd:element name="Manual" type="xsd:boolean" minOccurs="0">
                      <xsd:annotation>
                        <xsd:documentation>Whether the task is manually scheduled.</xsd:documentation>
                      </xsd:annotation>
                    </xsd:element>
                    <xsd:element name="Active" type="xsd:boolean" minOccurs="0">
                      <xsd:annotation>
                        <xsd:documentation>Whether the task is active.</xsd:documentation>
                      </xsd:annotation>
                    </xsd:element>
                    $2
'@,
        1
    )
}

if ($xsd -notmatch 'name="NewTasksAreManual"' -or $xsd -notmatch 'name="Manual"') {
    throw 'Failed to inject Project 2010+ Manual/Active schema extensions into MSPDI XSD.'
}

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
