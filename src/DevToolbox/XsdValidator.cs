using System.Xml;
using System.Xml.Schema;

namespace Stoneworx.DevToolbox;

public sealed record XsdValidationError(int Line, int Column, string Severity, string Message);

public sealed record XsdValidationResult(bool Valid, IReadOnlyList<XsdValidationError> Errors);

/// <summary>Validates XML against an XSD. The browser has no schema validator, so the web UI posts to this.</summary>
public static class XsdValidator
{
    private const int MaxErrors = 500;

    public static XsdValidationResult Validate(string xml, string xsd)
    {
        var errors = new List<XsdValidationError>();
        void Collect(object? _, ValidationEventArgs e)
        {
            if (errors.Count < MaxErrors)
                errors.Add(new(e.Exception.LineNumber, e.Exception.LinePosition, e.Severity.ToString(), e.Message));
        }

        // No resolver and no DTDs: pasted documents must not make Studio Pro fetch files or URLs.
        var secure = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };

        var schemas = new XmlSchemaSet { XmlResolver = null };
        schemas.ValidationEventHandler += Collect;
        try
        {
            using var schemaReader = XmlReader.Create(new StringReader(xsd), secure);
            schemas.Add(null, schemaReader);
            schemas.Compile();
        }
        catch (Exception e) when (e is XmlException or XmlSchemaException)
        {
            return new(false, [ToError("Schema", e)]);
        }
        if (errors.Count > 0) return new(false, errors.Select(e => e with { Message = $"Schema: {e.Message}" }).ToList());

        var settings = secure.Clone();
        settings.ValidationType = ValidationType.Schema;
        settings.Schemas = schemas;
        settings.ValidationFlags |= XmlSchemaValidationFlags.ReportValidationWarnings;
        settings.ValidationEventHandler += Collect;
        try
        {
            using var reader = XmlReader.Create(new StringReader(xml), settings);
            while (reader.Read()) { }
        }
        catch (XmlException e)
        {
            errors.Add(ToError("XML", e));
        }

        return new(errors.All(e => e.Severity != nameof(XmlSeverityType.Error)), errors);
    }

    private static XsdValidationError ToError(string source, Exception e) => e switch
    {
        XmlException x => new(x.LineNumber, x.LinePosition, "Error", $"{source}: {x.Message}"),
        XmlSchemaException s => new(s.LineNumber, s.LinePosition, "Error", $"{source}: {s.Message}"),
        _ => new(0, 0, "Error", $"{source}: {e.Message}"),
    };
}
