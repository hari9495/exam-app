param([string]$In, [string]$OutDocx, [string]$OutPdf)
$w = New-Object -ComObject Word.Application
$w.Visible = $false
$w.DisplayAlerts = 0
try {
  $doc = $w.Documents.Open($In, $false, $false)
  foreach ($t in $doc.TablesOfContents) { $t.Update() }
  $doc.Fields.Update() | Out-Null
  $doc.SaveAs2($OutDocx, 16)            # wdFormatDocumentDefault
  if ($OutPdf) { $doc.SaveAs2($OutPdf, 17) }   # wdFormatPDF
  "pages: " + $doc.ComputeStatistics(2)
  $doc.Close($false)
} finally { $w.Quit() }
