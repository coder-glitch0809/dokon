param(
    [string]$InputPath = (Join-Path $env:USERPROFILE 'Downloads\scale.txt'),
    [string]$OutputPath = (Join-Path $PSScriptRoot 'Tarozi_Yorliqlari_56x38mm.docx')
)

$ErrorActionPreference = 'Stop'

function XmlEscape([string]$Text) {
    return [System.Security.SecurityElement]::Escape($Text)
}

function ParagraphXml {
    param(
        [string]$Text,
        [int]$SizeHalfPoints,
        [int]$AfterTwips,
        [bool]$Bold = $true,
        [string]$Color = '000000',
        [bool]$KeepNext = $false
    )

    $escaped = XmlEscape $Text
    $boldXml = if ($Bold) { '<w:b/><w:bCs/>' } else { '' }
    $keepXml = if ($KeepNext) { '<w:keepNext/>' } else { '' }
    return @"
<w:p>
  <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="$AfterTwips" w:line="240" w:lineRule="auto"/>$keepXml<w:keepLines/></w:pPr>
  <w:r>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>$boldXml<w:color w:val="$Color"/><w:sz w:val="$SizeHalfPoints"/><w:szCs w:val="$SizeHalfPoints"/><w:lang w:val="uz-Latn-UZ"/></w:rPr>
    <w:t xml:space="preserve">$escaped</w:t>
  </w:r>
</w:p>
"@
}

if (-not (Test-Path -LiteralPath $InputPath)) {
    throw "TXT fayl topilmadi: $InputPath"
}

$items = New-Object System.Collections.Generic.List[object]
$lineNumber = 0
foreach ($line in [System.IO.File]::ReadAllLines($InputPath)) {
    $lineNumber++
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $fields = $line.Split(';')
    if ($fields.Count -lt 8) { throw "$lineNumber-satrda ustunlar yetarli emas." }

    $code = $fields[0].Trim()
    $name = $fields[1].Trim()
    $priceRaw = $fields[3].Trim()
    $plu = $fields[7].Trim()
    if (-not $name -or $priceRaw -notmatch '^\d+$') {
        throw "$lineNumber-satr noto'g'ri: $line"
    }
    if (-not $plu) { $plu = $code }

    $price = ([long]$priceRaw).ToString('#,0', [System.Globalization.CultureInfo]::InvariantCulture).Replace(',', ' ')
    $items.Add([pscustomobject]@{ Code=$code; Name=$name; Price=$price; Plu=$plu })
}

if ($items.Count -eq 0) { throw 'TXT faylda mahsulot topilmadi.' }

$body = New-Object System.Text.StringBuilder
for ($i = 0; $i -lt $items.Count; $i++) {
    $item = $items[$i]
    [void]$body.Append((ParagraphXml -Text 'NOMI' -SizeHalfPoints 13 -AfterTwips 0 -Bold $true -Color '555555' -KeepNext $true))
    [void]$body.Append((ParagraphXml -Text $item.Name -SizeHalfPoints 26 -AfterTwips 30 -Bold $true -Color '000000' -KeepNext $true))
    [void]$body.Append((ParagraphXml -Text ("NARXI: {0} SO'M" -f $item.Price) -SizeHalfPoints 29 -AfterTwips 35 -Bold $true -Color '000000' -KeepNext $true))
    [void]$body.Append((ParagraphXml -Text ("PLU: {0}     KODI: {1}" -f $item.Plu, $item.Code) -SizeHalfPoints 17 -AfterTwips 0 -Bold $true -Color '000000'))
    if ($i -lt $items.Count - 1) {
        [void]$body.Append('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>')
    }
}

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    $($body.ToString())
    <w:sectPr>
      <w:pgSz w:w="3175" w:h="2154" w:orient="landscape"/>
      <w:pgMar w:top="57" w:right="57" w:bottom="57" w:left="57" w:header="0" w:footer="0" w:gutter="0"/>
      <w:cols w:space="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@

$rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@

$documentRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>
'@

$now = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Tarozi yorliqlari 56x38 mm</dc:title><dc:creator>Zamon Market</dc:creator><cp:lastModifiedBy>Zamon Market</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$now</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">$now</dcterms:modified>
</cp:coreProperties>
"@

$appXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application><Pages>$($items.Count)</Pages><Company>Zamon Market</Company>
</Properties>
"@

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("zamon-labels-" + [Guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null
try {
    foreach ($dir in @('_rels','word','word\_rels','docProps')) {
        [System.IO.Directory]::CreateDirectory((Join-Path $tempRoot $dir)) | Out-Null
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot '[Content_Types].xml'), $contentTypes, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot '_rels\.rels'), $rootRels, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot 'word\document.xml'), $documentXml, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot 'word\styles.xml'), $stylesXml, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot 'word\_rels\document.xml.rels'), $documentRels, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot 'docProps\core.xml'), $coreXml, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $tempRoot 'docProps\app.xml'), $appXml, $utf8)

    if (Test-Path -LiteralPath $OutputPath) { [System.IO.File]::Delete($OutputPath) }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $outStream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($outStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        try {
            foreach ($file in [System.IO.Directory]::GetFiles($tempRoot, '*', [System.IO.SearchOption]::AllDirectories)) {
                $relative = $file.Substring($tempRoot.Length + 1).Replace('\', '/')
                $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
                $entryStream = $entry.Open()
                try {
                    $bytes = [System.IO.File]::ReadAllBytes($file)
                    $entryStream.Write($bytes, 0, $bytes.Length)
                }
                finally { $entryStream.Dispose() }
            }
        }
        finally { $archive.Dispose() }
    }
    finally { $outStream.Dispose() }
}
finally {
    if (Test-Path -LiteralPath $tempRoot) { [System.IO.Directory]::Delete($tempRoot, $true) }
}

[pscustomobject]@{ Output=$OutputPath; Labels=$items.Count; WidthMm=56; HeightMm=38; MarginMm=1 }
