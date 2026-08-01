Attribute VB_Name = "ZamonTaroziYorliq"
Option Explicit

' scale.txt ustunlari (0 dan boshlanadi):
' 0 = mahsulot kodi, 1 = nomi, 3 = narxi, 7 = PLU.
' Agar tarozi eksport formati o'zgarsa, faqat shu qiymatlarni almashtiring.
Private Const COL_CODE As Long = 0
Private Const COL_NAME As Long = 1
Private Const COL_PRICE As Long = 3
Private Const COL_PLU As Long = 7

' Ushbu modul makrosli hujjatga saqlansa, hujjat ochilganda avtomatik ishlaydi.
Public Sub AutoOpen()
    TaroziYorliqlariniYarat
End Sub

Public Sub TaroziYorliqlariniYarat()
    Dim filePath As String
    filePath = TxtFaylniTanlash()
    If Len(filePath) = 0 Then Exit Sub

    Dim txt As String
    On Error GoTo ReadError
    txt = ReadTextAuto(filePath)
    On Error GoTo 0

    If Len(Trim$(txt)) = 0 Then
        MsgBox "Tanlangan TXT fayl bo'sh.", vbExclamation, "Tarozi yorliqlari"
        Exit Sub
    End If

    Dim outDoc As Document
    Set outDoc = Documents.Add
    SetupLabelPage outDoc

    Dim normalized As String
    normalized = Replace(txt, vbCrLf, vbLf)
    normalized = Replace(normalized, vbCr, vbLf)

    Dim lines() As String
    lines = Split(normalized, vbLf)

    Dim i As Long, made As Long, skipped As Long
    Dim itemName As String, itemPrice As String
    Dim itemPlu As String, itemCode As String

    Application.ScreenUpdating = False
    On Error GoTo BuildError

    For i = LBound(lines) To UBound(lines)
        If Len(Trim$(lines(i))) > 0 Then
            If ParseScaleLine(lines(i), itemName, itemPrice, itemPlu, itemCode) Then
                If made > 0 Then InsertPageBreakAtEnd outDoc
                AddOneLabel outDoc, itemName, itemPrice, itemPlu, itemCode
                made = made + 1
            Else
                skipped = skipped + 1
            End If
        End If
    Next i

    Application.ScreenUpdating = True

    If made = 0 Then
        outDoc.Close SaveChanges:=wdDoNotSaveChanges
        MsgBox "Mos mahsulot topilmadi." & vbCrLf & _
               "Kutilgan format: 1;Mosh;;21000;...;1;...", _
               vbExclamation, "Tarozi yorliqlari"
        Exit Sub
    End If

    outDoc.Activate
    MsgBox CStr(made) & " ta yorliq yaratildi." & _
           IIf(skipped > 0, vbCrLf & CStr(skipped) & " ta noto'g'ri satr o'tkazib yuborildi.", ""), _
           vbInformation, "Tarozi yorliqlari"
    Exit Sub

ReadError:
    MsgBox "TXT faylni o'qib bo'lmadi:" & vbCrLf & Err.Description, _
           vbCritical, "Tarozi yorliqlari"
    Exit Sub

BuildError:
    Application.ScreenUpdating = True
    If Not outDoc Is Nothing Then outDoc.Close SaveChanges:=wdDoNotSaveChanges
    MsgBox "Yorliqlarni yaratishda xato:" & vbCrLf & Err.Description, _
           vbCritical, "Tarozi yorliqlari"
End Sub

Private Function TxtFaylniTanlash() As String
    ' Odatdagi scale.txt mavjud bo'lsa, hujjat ochilishi bilan avtomatik oladi.
    Dim defaultPath As String
    defaultPath = Environ$("USERPROFILE") & "\Downloads\scale.txt"
    If Len(Dir$(defaultPath)) > 0 Then
        TxtFaylniTanlash = defaultPath
        Exit Function
    End If

    Dim dlg As FileDialog
    Set dlg = Application.FileDialog(msoFileDialogFilePicker)

    With dlg
        .Title = "Tarozi TXT faylini tanlang"
        .AllowMultiSelect = False
        .Filters.Clear
        .Filters.Add "Matn fayllari", "*.txt"
        .Filters.Add "Barcha fayllar", "*.*"
        If .Show <> -1 Then Exit Function
        TxtFaylniTanlash = .SelectedItems(1)
    End With
End Function

Private Function ParseScaleLine(ByVal sourceLine As String, _
                                ByRef itemName As String, _
                                ByRef itemPrice As String, _
                                ByRef itemPlu As String, _
                                ByRef itemCode As String) As Boolean
    Dim s As String
    s = Trim$(Replace(sourceLine, ChrW(&HFEFF), ""))

    ' Birinchi qatordagi "1:Mosh;;..." xatosini ham qabul qiladi.
    Dim colonPos As Long, semicolonPos As Long
    colonPos = InStr(1, s, ":", vbBinaryCompare)
    semicolonPos = InStr(1, s, ";", vbBinaryCompare)
    If colonPos > 1 And (semicolonPos = 0 Or colonPos < semicolonPos) Then
        s = Left$(s, colonPos - 1) & ";" & Mid$(s, colonPos + 1)
    End If

    Dim fields() As String
    fields = Split(s, ";")
    If UBound(fields) < COL_PRICE Then Exit Function

    itemCode = CleanField(fields(COL_CODE))
    itemName = CleanField(fields(COL_NAME))
    itemPrice = CleanField(fields(COL_PRICE))

    If UBound(fields) >= COL_PLU Then
        itemPlu = CleanField(fields(COL_PLU))
    Else
        itemPlu = itemCode
    End If

    If Len(itemPlu) = 0 Then itemPlu = itemCode
    If Len(itemName) = 0 Or Len(itemPrice) = 0 Then Exit Function
    If Not IsNumeric(Replace(itemPrice, ",", ".")) Then Exit Function

    ParseScaleLine = True
End Function

Private Function CleanField(ByVal value As String) As String
    CleanField = Trim$(Replace(Replace(value, Chr$(34), ""), vbTab, " "))
End Function

Private Sub SetupLabelPage(ByVal doc As Document)
    With doc.Sections(1).PageSetup
        ' Avval marginlar kichraytiriladi. Aks holda Word standart katta
        ' marginlar bilan 5,6 sm kenglikni hisoblab, 5505 xatosini beradi.
        .TopMargin = CentimetersToPoints(0.1)
        .BottomMargin = CentimetersToPoints(0.1)
        .LeftMargin = CentimetersToPoints(0.1)
        .RightMargin = CentimetersToPoints(0.1)
        .PageWidth = CentimetersToPoints(5.6)
        .PageHeight = CentimetersToPoints(3.8)
        .HeaderDistance = 0
        .FooterDistance = 0
        .Gutter = 0
    End With

    With doc.Styles(wdStyleNormal)
        .Font.Name = "Arial"
        .Font.Size = 8
        .ParagraphFormat.SpaceBefore = 0
        .ParagraphFormat.SpaceAfter = 0
        .ParagraphFormat.LineSpacingRule = wdLineSpaceSingle
    End With
End Sub

Private Sub AddOneLabel(ByVal doc As Document, ByVal itemName As String, _
                        ByVal itemPrice As String, ByVal itemPlu As String, _
                        ByVal itemCode As String)
    ' Jadval ishlatilmaydi: Word jadval ustuniga kamida 1,27 sm talab qiladi.
    ' Oddiy paragraflar 56 x 38 mm yorliqda bu cheklovsiz ishlaydi.
    Dim startPos As Long
    startPos = doc.Content.End - 1

    Dim rng As Range
    Set rng = doc.Range(Start:=startPos, End:=startPos)
    rng.Text = "NOMI" & vbCr & itemName & vbCr & _
               "NARXI: " & FormatPrice(itemPrice) & " SO'M" & vbCr & _
               "PLU: " & itemPlu & "    KODI: " & itemCode

    Dim labelRng As Range
    Set labelRng = doc.Range(Start:=startPos, End:=doc.Content.End - 1)

    With labelRng.Paragraphs(1).Range
        .Font.Name = "Arial"
        .Font.Size = 6.5
        .Font.Bold = True
        .Font.Color = RGB(85, 85, 85)
        .ParagraphFormat.Alignment = wdAlignParagraphCenter
    End With

    With labelRng.Paragraphs(2).Range
        .Font.Name = "Arial"
        .Font.Size = 13
        .Font.Bold = True
        .ParagraphFormat.Alignment = wdAlignParagraphCenter
        .ParagraphFormat.SpaceAfter = 1.5
    End With

    With labelRng.Paragraphs(3).Range
        .Font.Name = "Arial"
        .Font.Size = 14.5
        .Font.Bold = True
        .ParagraphFormat.Alignment = wdAlignParagraphCenter
        .ParagraphFormat.SpaceAfter = 1.5
    End With

    With labelRng.Paragraphs(4).Range
        .Font.Name = "Arial"
        .Font.Size = 8.5
        .Font.Bold = True
        .ParagraphFormat.Alignment = wdAlignParagraphCenter
    End With
End Sub

Private Sub InsertPageBreakAtEnd(ByVal doc As Document)
    Dim rng As Range
    Set rng = doc.Range(Start:=doc.Content.End - 1, End:=doc.Content.End - 1)
    rng.InsertBreak wdPageBreak
End Sub

Private Function FormatPrice(ByVal rawPrice As String) As String
    Dim digits As String
    digits = Replace(Replace(Trim$(rawPrice), " ", ""), ChrW(160), "")

    If Len(digits) = 0 Or Not IsNumeric(digits) Then
        FormatPrice = rawPrice
        Exit Function
    End If

    ' Tarozi narxi butun son bo'lgani uchun mingliklarni lokal sozlamaga
    ' bog'lamasdan har doim bo'sh joy bilan ajratadi: 21000 -> 21 000.
    Dim result As String
    Do While Len(digits) > 3
        result = " " & Right$(digits, 3) & result
        digits = Left$(digits, Len(digits) - 3)
    Loop
    FormatPrice = digits & result
End Function

Private Function ReadTextAuto(ByVal filePath As String) As String
    ' UTF-8 ni birinchi sinaydi. Oddiy ANSI/ASCII matn ham to'g'ri o'qiladi.
    Dim stm As Object
    Set stm = CreateObject("ADODB.Stream")
    With stm
        .Type = 2
        .Charset = "utf-8"
        .Open
        .LoadFromFile filePath
        ReadTextAuto = .ReadText(-1)
        .Close
    End With
End Function
