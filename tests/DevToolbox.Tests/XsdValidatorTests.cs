using Stoneworx.DevToolbox;
using Xunit;

public class XsdValidatorTests
{
    private const string Schema = """
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
          <xs:element name="order">
            <xs:complexType>
              <xs:sequence><xs:element name="total" type="xs:decimal"/></xs:sequence>
              <xs:attribute name="id" type="xs:int" use="required"/>
            </xs:complexType>
          </xs:element>
        </xs:schema>
        """;

    [Fact]
    public void AcceptsMatchingDocument()
    {
        var result = XsdValidator.Validate("<order id=\"1\"><total>2.5</total></order>", Schema);
        Assert.True(result.Valid);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void ReportsEveryErrorWithItsPosition()
    {
        var result = XsdValidator.Validate("<order>\n  <total>abc</total>\n</order>", Schema);
        Assert.False(result.Valid);
        Assert.Equal(2, result.Errors.Count);
        Assert.Contains(result.Errors, e => e.Line == 2 && e.Message.Contains("total"));
    }

    [Fact]
    public void ReportsMalformedXml()
    {
        var result = XsdValidator.Validate("<order id=\"1\"><total>1</order>", Schema);
        Assert.False(result.Valid);
        Assert.StartsWith("XML:", result.Errors.Last().Message);
    }

    [Fact]
    public void ReportsBrokenSchema()
    {
        var result = XsdValidator.Validate("<a/>", "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"><xs:element name=\"a\" type=\"xs:nope\"/></xs:schema>");
        Assert.False(result.Valid);
        Assert.StartsWith("Schema", result.Errors[0].Message);
    }

    [Fact]
    public void RefusesDtds()
    {
        var xml = "<!DOCTYPE order [<!ENTITY x SYSTEM \"file:///c:/windows/win.ini\">]><order id=\"1\"><total>&x;</total></order>";
        var result = XsdValidator.Validate(xml, Schema);
        Assert.False(result.Valid);
        Assert.Contains("DTD", result.Errors[0].Message);
    }
}
