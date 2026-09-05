$files = Get-ChildItem -Path . -Recurse -Include *.html,*.js -Exclude node_modules -File
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if ($content -ne $null) {
        $newContent = $content.Replace("â€”", "—").Replace("â€¦", "…").Replace("â† ", "← ").Replace("â†’", "→").Replace("â‹®", "⋮").Replace("â‚¹", "₹")
        if ($content -cne $newContent) {
            Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8
            Write-Output "Updated $($file.Name)"
        }
    }
}
