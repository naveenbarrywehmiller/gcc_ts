"""Build the requirements report as a native PBIP/PBIR project (no PBIX editing).

Run with Python 3. This is the original BIM scaffold, not the saved TMDL project's source of truth.
No credentials, employee records, or synthetic business data are embedded.
"""
import json
import datetime
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'powerbi'
OUT = ROOT / 'GCC_Requirements'
MODEL = OUT / 'GCC_Requirements.SemanticModel'
REPORT = OUT / 'GCC_Requirements.Report'
SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/'

if (MODEL / 'definition').exists():
    raise SystemExit('The canonical project is saved as TMDL. This legacy BIM generator would overwrite Desktop edits. Use Desktop/TMDL to maintain it, or explicitly choose a separate output folder.')

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'gcc-requirements/' + name))

expressions = []
tables = []
relationships = []
measures = []

def expr(name, code, description=''):
    expressions.append(dict(name=name, kind='m', expression=code.strip(), description=description))

def parameter(name, value, mtype, description):
    expr(name, f'{value} meta [IsParameterQuery=true, Type="{mtype}", IsParameterQueryRequired=true]', description)

parameter('ApiBaseUrl', '"https://dietpi.tail4f2b8f.ts.net"', 'Text', 'Server origin. Store the reporting API key in Web Basic credentials: username powerbi, password reporting key.')
parameter('ApiPath', '"api/powerbi"', 'Text', 'REST reporting namespace, without leading or trailing slash.')
parameter('FiscalStartMonth', '1', 'Number', 'Provisional: January. Set 1–12 before refresh.')
parameter('DailyHours', '8', 'Number', 'Standard Monday–Friday hours per employee. Provisional 8.')
parameter('DefectTarget', '0', 'Number', 'Provisional target ratio; confirm with KPI owner. Red beyond target ± 0.05.')
parameter('DeliverablesEndpoint', '\"\"', 'Text', 'Optional endpoint name within ApiPath, returning one unique deliverable record per ID. Empty until an approved source exists.')
parameter('ImprovementsEndpoint', '\"\"', 'Text', 'Optional endpoint name within ApiPath, returning one unique improvement record per ID. Empty until an approved source exists.')
expr('RefreshClock', 'DateTimeZone.SwitchZone(DateTimeZone.FixedUtcNow(), 5, 30)', 'One refresh-time IST clock (UTC+05:30); dates and freshness use the same instant.')
expr('fnApi', '''(endpoint as text) as list =>
let
    Fetch = (page as number) as record =>
        let
            Payload = Json.Document(Web.Contents(ApiBaseUrl, [
                RelativePath = Text.Trim(ApiPath, "/") & "/" & endpoint,
                Query = if endpoint = "timesheets" then [page=Text.From(page), limit="1000"] else [],
                Headers = [Accept="application/json"], Timeout=#duration(0,0,5,0)])),
            Checked = if Value.Is(Payload, type record) and Record.HasFields(Payload, "data")
                and Value.Is(Payload[data], type list) then Payload
                else error "The reporting API must return a record containing a data list."
        in Checked,
    First = Fetch(1),
    Pages = if endpoint = "timesheets" then
        (if Record.HasFields(First, "pagination") and Record.HasFields(First[pagination], "totalPages")
            then Number.From(First[pagination][totalPages]) else error "Missing timesheet pagination metadata.") else 1,
    ValidPages = if Pages >= 1 and Number.RoundDown(Pages) = Pages then Pages else error "Invalid page count.",
    Rows = List.Combine({First[data]} & (if ValidPages > 1 then List.Transform({2..ValidPages}, each Fetch(_)[data]) else {})),
    CheckedCount = if endpoint = "timesheets" and List.Count(Rows) <> First[pagination][total]
        then error "Timesheet total changed during pagination. Retry refresh." else Rows
in CheckedCount''')

MTYPE = {'string':'text','int64':'Int64.Type','double':'number','boolean':'logical','dateTime':'date'}

def table(name, columns, source, description='', hidden=False):
    cols=[]
    for cname, dtype in columns:
        col=dict(name=cname, dataType=dtype, sourceColumn=cname, summarizeBy='none', lineageTag=uid(name+'/'+cname))
        if dtype=='dateTime':
            col['formatString']='yyyy-mm-dd'
            col['annotations']=[dict(name='UnderlyingDateTimeDataType',value='Date')]
        cols.append(col)
    tables.append(dict(name=name, description=description, isHidden=hidden, lineageTag=uid(name), columns=cols,
                       partitions=[dict(name=name, mode='import', source=dict(type='m', expression=source.strip()))]))

def api_table(name, endpoint, columns, description='', extra='', result='Typed', key=None):
    names=json.dumps([c for c,t in columns])
    # M lists use braces rather than JSON array brackets.
    names='{'+', '.join(json.dumps(c) for c,t in columns)+'}'
    types='{'+', '.join('{'+json.dumps(c)+', '+('type '+MTYPE[t] if t!='int64' else MTYPE[t])+'}' for c,t in columns)+'}'
    check=f'if List.Count(List.Distinct(Typed[{key}])) <> Table.RowCount(Typed) or List.Contains(Typed[{key}], null) then error "Duplicate or missing {name} key." else Typed' if key else 'Typed'
    source=f'let\n    Rows = fnApi("{endpoint}"),\n    Raw = Table.FromRecords(Rows, {names}, MissingField.UseNull),\n    Typed = Table.TransformColumnTypes(Raw, {types}, "en-US"),\n    Checked = {check}{extra}\nin {result if extra else "Checked"}'
    table(name, columns, source, description)

api_table('DimEmployee','users', [('id','int64'),('employeeId','string'),('employeeName','string'),('division','string'),('department','string'),('supportingCategory','string'),('role','string'),('isActive','boolean')],
          'Current employee roster. No employment start/end history is available; capacity is an estimate using the current active roster.',key='id')
project_cols=[('id','int64'),('projectCode','string'),('projectName','string'),('division','string'),('subdivision','string'),('teamType','string'),('product','string'),('productModule','string'),('activity','string'),('startDate','dateTime'),('targetDate','dateTime'),('deliveredDate','dateTime'),('budgetHours','double'),('projectStatus','string'),('isActive','boolean')]
api_table('DimProject','projects',project_cols,'One project/task master record. A project is not assumed to equal a deliverable.', key='id')
api_table('DimDivision','divisions',[('id','int64'),('divisionName','string')],key='id')
api_table('DimHoliday','holidays',[('id','int64'),('date','dateTime'),('holidayName','string')],key='id')
api_table('DimTask','tasks',[('id','int64'),('taskCategory','string'),('classification','string')],key='id')
expr('HourCategoryMap', '''#table(type table [taskCategory=text, hourCategory=text], {
    {"development","Productive"}, {"bug fix","Productive"}, {"code review","Productive"},
    {"testing","Productive"}, {"design","Productive"}, {"documentation","Productive"},
    {"training","Training"}, {"meeting","Internal"}, {"admin","Admin"},
    {"leave","Vacation"}, {"vacation","Vacation"}, {"holiday","Holiday"}
})''', 'Explicit editable classification. Unmapped categories block utilization so they cannot silently inflate it.')
expr('TimesheetRows', '''let
    Rows=fnApi("timesheets"),
    Required={"id","userId","projectId","taskId","date","hours","status","weeklyRowKey","weeklyDetails"},
    Checked=if List.AllTrue(List.Transform(Rows, each Record.HasFields(_, Required))) then Rows
        else error "Deploy the requirements API update: stable IDs and weeklyRowKey are required.",
    T=Table.FromRecords(Checked, {"id","userId","projectId","taskId","date","hours","status","division","department","projectCategory","weeklyRowKey","weeklyDetails","updatedDate"}, MissingField.UseNull),
    Typed=Table.TransformColumnTypes(T, {{"id",Int64.Type},{"userId",Int64.Type},{"projectId",Int64.Type},{"taskId",Int64.Type},{"date",type date},{"hours",type number},{"status",type text},{"division",type text},{"department",type text},{"projectCategory",type text},{"weeklyRowKey",type text},{"updatedDate",type datetime}}),
    Unique=if Table.RowCount(Typed)=List.Count(List.Distinct(Typed[id])) then Typed else error "Duplicate timesheet IDs.",
    CategoryKey=Table.AddColumn(Unique,"categoryKey",each Text.Lower(Text.Trim([projectCategory] ?? "")),type text),
    Joined=Table.NestedJoin(CategoryKey,{"categoryKey"},HourCategoryMap,{"taskCategory"},"Map",JoinKind.LeftOuter),
    Expanded=Table.ExpandTableColumn(Joined,"Map",{"hourCategory"}),
    Categorized=Table.ReplaceValue(Expanded,null,"Unmapped",Replacer.ReplaceValue,{"hourCategory"})
in Categorized''')
table('FactTimesheet',[('id','int64'),('userId','int64'),('projectId','int64'),('taskId','int64'),('date','dateTime'),('hours','double'),('status','string'),('division','string'),('department','string'),('hourCategory','string')],
      'Table.SelectColumns(TimesheetRows,{"id","userId","projectId","taskId","date","hours","status","division","department","hourCategory"})',
      'One daily entry. Actual hours include submitted and approved entries only; raw hours retain all statuses.')
detail_fields=json.loads((ROOT.parent/'server/src/config/timesheetFields.json').read_text())
weekly_cols=[('weeklyRowKey','string'),('userId','int64'),('projectId','int64'),('taskId','int64'),('date','dateTime'),('detailConflict','boolean')]+[(f['key'], 'int64' if f['type']=='number' else 'dateTime' if f['type']=='date' else 'string') for f in detail_fields]
fields='{'+','.join(json.dumps(f['key']) for f in detail_fields)+'}'
type_pairs='{'+','.join('{'+json.dumps(c)+','+('Int64.Type' if t=='int64' else 'type '+MTYPE[t])+'}' for c,t in weekly_cols)+'}'
table('FactWeeklyDetails',weekly_cols,f'''let
    Eligible=Table.SelectRows(TimesheetRows, each List.Contains({{"submitted","approved"}},[status])),
    Grouped=Table.Group(Eligible,{{"weeklyRowKey"}},{{
        {{"Latest",each Table.First(Table.Sort(_,{{{{"updatedDate",Order.Descending}},{{"id",Order.Descending}}}})),type record}},
        {{"detailConflict",each List.Count(List.Distinct(List.Transform([weeklyDetails], each Text.FromBinary(Json.FromValue(_)))))>1,type logical}}
    }}),
    Expanded=Table.ExpandRecordColumn(Grouped,"Latest",{{"userId","projectId","taskId","date","weeklyDetails"}}),
    WeekStart=Table.TransformColumns(Expanded,{{{{"date",each Date.StartOfWeek(_,Day.Monday),type date}}}}),
    Details=Table.TransformColumns(WeekStart,{{{{"weeklyDetails", each Record.SelectFields(_, {fields}, MissingField.UseNull),type record}}}}),
    Flattened=Table.ExpandRecordColumn(Details,"weeklyDetails",{fields}),
    Typed=Table.TransformColumnTypes(Flattened,{type_pairs},"en-US")
in Typed''','One employee/week/project/task/row-dimension record, using the latest daily copy. Counts attributed to Monday. Conflicting copies block quality totals.')
api_table('FactVacation','planned-vacations',[('id','int64'),('userId','int64'),('date','dateTime')], 'Planned full-day absence, not approved or actual leave.',key='id')
api_table('FactStaffing','staffing',[('id','int64'),('divisionId','int64'),('division','string'),('date','dateTime'),('openPositions','int64'),('newJoiners','int64')], 'One division/month. Open positions are a snapshot, new joiners a monthly flow. Blank differs from zero.',key='id')
table('Settings',[('FiscalStartMonth','int64'),('DailyHours','double'),('DefectTarget','double'),('AsOfDate','dateTime'),('RefreshIST','string')], '''let
    Valid=if FiscalStartMonth<1 or FiscalStartMonth>12 or Number.RoundDown(FiscalStartMonth)<>FiscalStartMonth or DailyHours<=0 or DailyHours>24 then error "Invalid capacity settings." else true
in if Valid then #table(type table [FiscalStartMonth=Int64.Type,DailyHours=number,DefectTarget=number,AsOfDate=date,RefreshIST=text],
    {{FiscalStartMonth,DailyHours,DefectTarget,Date.From(DateTimeZone.RemoveZone(RefreshClock)),DateTimeZone.ToText(RefreshClock,"yyyy-MM-dd HH:mm:ss 'IST'")}}) else error "Invalid settings"''')
table('DimDate',[('Date','dateTime'),('Year','int64'),('Month','string'),('MonthNumber','int64'),('YearMonth','string'),('WeekStart','dateTime'),('FiscalYear','string'),('IsWeekday','boolean'),('IsHoliday','boolean')],'''let
    Today=Date.From(DateTimeZone.RemoveZone(RefreshClock)),
    Dates=List.RemoveNulls(List.Combine({FactTimesheet[date],DimProject[startDate],DimProject[targetDate],DimProject[deliveredDate],FactStaffing[date],FactVacation[date],{Date.AddYears(Today,-1),Date.AddYears(Today,1)}})),
    Start=Date.StartOfYear(List.Min(Dates)), End=Date.EndOfYear(List.Max(Dates)),
    Source=Table.FromList(List.Dates(Start,Duration.Days(End-Start)+1,#duration(1,0,0,0)),Splitter.SplitByNothing(),{"Date"}),
    Typed=Table.TransformColumnTypes(Source,{{"Date",type date}}),
    Y=Table.AddColumn(Typed,"Year",each Date.Year([Date]),Int64.Type),
    M=Table.AddColumn(Y,"Month",each Date.ToText([Date],"MMM","en-US"),type text),
    MN=Table.AddColumn(M,"MonthNumber",each Date.Month([Date]),Int64.Type),
    YM=Table.AddColumn(MN,"YearMonth",each Date.ToText([Date],"yyyy-MM"),type text),
    W=Table.AddColumn(YM,"WeekStart",each Date.StartOfWeek([Date],Day.Monday),type date),
    FY=Table.AddColumn(W,"FiscalYear",each "FY " & Text.From(Date.Year(Date.AddMonths([Date],1-FiscalStartMonth))),type text),
    WD=Table.AddColumn(FY,"IsWeekday",each Date.DayOfWeek([Date],Day.Monday)<5,type logical),
    H=Table.AddColumn(WD,"IsHoliday",each List.Contains(DimHoliday[date],[Date]),type logical)
in H''','FiscalYear is labeled by its start year. Continuous dates covering source data and the next year.')
tables[-1]['columns'][0]['isKey']=True
tables[-1]['columns'][2]['sortByColumn']='MonthNumber'
tables[-1]['annotations']=[dict(name='__PBI_LocalDateTable',value='false')]

# Empty typed extension contracts: populated only after the source is provided.
delivery_cols=[('deliverableId','string'),('projectId','int64'),('plannedDate','dateTime'),('deliveredDate','dateTime'),('fundamentalErrors','int64'),('informationErrors','int64'),('readableErrors','int64'),('hadRework','boolean')]
table('FactDeliverable',delivery_cols,'#table(type table [deliverableId=text,projectId=Int64.Type,plannedDate=date,deliveredDate=date,fundamentalErrors=Int64.Type,informationErrors=Int64.Type,readableErrors=Int64.Type,hadRework=logical], {})',
      'Awaiting a deliverable register. One unique deliverable ID; null means unknown, zero means confirmed none. Replace this typed empty query with the approved REST source.')
table('FactImprovement',[('improvementId','string'),('projectId','int64'),('date','dateTime'),('category','string'),('product','string'),('isAdditiveManufacturing','boolean')],
      '#table(type table [improvementId=text,projectId=Int64.Type,date=date,category=text,product=text,isAdditiveManufacturing=logical], {})',
      'Awaiting a unique improvement register for VAVE, Automation, COE, Cost optimization and additive manufacturing. Weekly improvement counts remain separately available.')
for optional_name, endpoint_parameter, key in [('FactDeliverable','DeliverablesEndpoint','deliverableId'),('FactImprovement','ImprovementsEndpoint','improvementId')]:
    optional_table=next(t for t in tables if t['name']==optional_name)
    empty_source=optional_table['partitions'][0]['source']['expression']
    optional_columns=optional_table['columns']
    names='{'+','.join(json.dumps(c['name']) for c in optional_columns)+'}'
    types='{'+','.join('{'+json.dumps(c['name'])+','+('Int64.Type' if c['dataType']=='int64' else 'type '+MTYPE[c['dataType']])+'}' for c in optional_columns)+'}'
    optional_table['partitions'][0]['source']['expression']=f'''let
    Raw=if Text.Trim({endpoint_parameter})="" then {empty_source} else Table.FromRecords(fnApi({endpoint_parameter}),{names},MissingField.UseNull),
    Typed=Table.TransformColumnTypes(Raw,{types}),
    Checked=if List.Contains(Typed[{key}],null) or List.Contains(Typed[{key}],"") or List.Count(List.Distinct(Typed[{key}]))<>Table.RowCount(Typed)
        then error "Missing or duplicate {key}." else Typed
in Checked'''

table('FactPlan',[('projectId','int64'),('date','dateTime'),('scheduledHours','double'),('remainingForecastHours','double')],'''let
    Today=Date.From(DateTimeZone.RemoveZone(RefreshClock)),
    Actuals=Table.Group(Table.SelectRows(FactTimesheet,each List.Contains({"approved","submitted"},[status]) and [date]<Today),{"projectId"},{{"Actual",each List.Sum([hours]),type number}}),
    Joined=Table.NestedJoin(DimProject,{"id"},Actuals,{"projectId"},"Actuals",JoinKind.LeftOuter),
    Expanded=Table.ExpandTableColumn(Joined,"Actuals",{"Actual"}),
    Valid=Table.SelectRows(Expanded,each [startDate]<>null and [targetDate]<>null and [targetDate]>=[startDate] and [budgetHours]<>null),
    Daily=Table.AddColumn(Valid,"Days",each let
        P=_, Days=List.Select(List.Dates(P[startDate],Duration.Days(P[targetDate]-P[startDate])+1,#duration(1,0,0,0)),each Date.DayOfWeek(_,Day.Monday)<5 and not List.Contains(DimHoliday[date],_)),
        Future=List.Select(Days,each _>=Today),
        Remaining=if P[projectStatus]="Inprogress" then List.Max({0,P[budgetHours]-(P[Actual] ?? 0)}) else 0
        in List.Transform(Days,each [projectId=P[id],date=_,scheduledHours=P[budgetHours]/List.Count(Days),
            remainingForecastHours=if _>=Today and List.Count(Future)>0 then Remaining/List.Count(Future) else 0])),
    Records=List.Combine(Daily[Days]),
    T=Table.FromRecords(Records,{"projectId","date","scheduledHours","remainingForecastHours"},MissingField.UseNull),
    Typed=Table.TransformColumnTypes(T,{{"projectId",Int64.Type},{"date",type date},{"scheduledHours",type number},{"remainingForecastHours",type number}})
in Typed''','Planning estimate: budget spread evenly over project weekdays excluding holidays. Remaining Inprogress budget spread from refresh date through target; Hold and Completed receive no future forecast. Past-due remaining effort is surfaced separately.')

coverage=[
('Monthly utilization','Available with assumptions','Submitted + approved work; training/internal/admin/leave/holiday excluded. Current active roster capacity, Mon–Fri. Unmapped task categories block result.'),
('Yearly utilization from project start','Needs allocation history','Roster FY utilization is provided separately. Exact project-start utilization needs employee project allocations and employment start/end dates.'),
('Defect density / FTR / F I R','Needs deliverable register','FactDeliverable requires unique IDs, delivered dates, error counts and rework flags. Weekly error counts are available separately.'),
('Effort / schedule / on-time','Available at project grain','Budget vs project lifetime actuals for projects delivered in selected dates. Project delivery is not treated as a deliverable count.'),
('Team strength / dedicated / flex','Available','Current active roster and distinct contributing employees are separate. Employee supportingCategory defines Dedicated/Flex.'),
('Vacation / holidays / capacity','Available with assumptions','Historical recorded leave; future planned vacation. Capacity is a current-roster estimate, not historical contracted capacity.'),
('Training / internal / admin hours','Available','Explicit HourCategoryMap. Edit mappings to match production task categories; do not infer from billable flag.'),
('Forecast / scheduled hours','Available as estimate','Budget spread evenly across working dates. No resource assignment exists; department-specific demand is blank.'),
('Products touched','Available','Distinct project products with submitted/approved work in selected dates; blank products excluded.'),
('Improvement / designed / developed','Available at weekly grain','Deduplicated weekly row details, attributed to Monday. Conflicting copies block counts.'),
('VAVE / Automation / COE / cost / additive','Needs improvement register','FactImprovement is an empty typed source contract; no fabricated classification or counts.'),
('Open positions / new joiners','Available','Read-only staffing endpoint. Open positions at last selected month, joiners summed over selected months. Null stays unknown.'),
('Schedule alert ±3%','Provisional definition','Schedule days divided by planned project duration. Workbook mixes days and percent; definition needs owner confirmation.'),
('Defect alert ±5%','Provisional target','DefectTarget defaults to 0; red at >5 percentage points away. Confirm target and whether tolerance means relative percent.'),
('Platform / cohorts','Needs business mapping','Division is available; no separate platform master or cohort definition exists. Do not silently rename division as platform.')]
coverage_source='#table(type table [Requirement=text,Status=text,Definition=text], {'+','.join('{'+','.join(json.dumps(v,ensure_ascii=False) for v in row)+'}' for row in coverage)+'})'
table('InputStatus',[('Requirement','string'),('Status','string'),('Definition','string')],coverage_source)

def rel(ft,fc,dt,dc):
    relationships.append(dict(name=uid(ft+'/'+fc+'/'+dt+'/'+dc),fromTable=ft,fromColumn=fc,toTable=dt,toColumn=dc,crossFilteringBehavior='oneDirection'))
for fact in ['FactTimesheet','FactWeeklyDetails']:
    rel(fact,'userId','DimEmployee','id'); rel(fact,'projectId','DimProject','id');rel(fact,'taskId','DimTask','id');rel(fact,'date','DimDate','Date')
rel('FactVacation','userId','DimEmployee','id');rel('FactVacation','date','DimDate','Date')
rel('FactStaffing','divisionId','DimDivision','id');rel('FactStaffing','date','DimDate','Date')
for fact,datecol in [('FactDeliverable','deliveredDate'),('FactImprovement','date'),('FactPlan','date')]:
    rel(fact,'projectId','DimProject','id');rel(fact,datecol,'DimDate','Date')
# Division is applied to project and employee facts explicitly by measures. Avoid
# ambiguous division -> employee AND division -> project paths into timesheets.

def measure(name, dax, folder, fmt='#,##0.0', description=''):
    measures.append(dict(name=name,expression=dax,displayFolder=folder,formatString=fmt,description=description,lineageTag=uid('measure/'+name)))

def m(name,dax,folder='01 Overview',fmt='#,##0.0',description=''):
    measure(name,dax,folder,fmt,description)

division_filter='KEEPFILTERS(FILTER(ALL(FactTimesheet[division]),NOT ISCROSSFILTERED(DimDivision) || FactTimesheet[division] IN VALUES(DimDivision[divisionName])))'
m('Raw Hours',f'CALCULATE(SUM(FactTimesheet[hours]), {division_filter})',description='All statuses including drafts/rejected. Use Actual Hours for reported work.')
m('Actual Hours','CALCULATE([Raw Hours], KEEPFILTERS(FactTimesheet[status] IN {"submitted", "approved"}))')
m('Approved Hours','CALCULATE([Raw Hours], KEEPFILTERS(FactTimesheet[status] = "approved"))')
m('Contributing Employees',f'CALCULATE(DISTINCTCOUNT(FactTimesheet[userId]), KEEPFILTERS(FactTimesheet[status] IN {{"submitted","approved"}}),{division_filter})',fmt='#,##0')
m('Active Team Strength','CALCULATE(COUNTROWS(DimEmployee), KEEPFILTERS(DimEmployee[isActive] = TRUE()), KEEPFILTERS(DimEmployee[role] <> "system admin"), KEEPFILTERS(FILTER(ALL(DimEmployee[division]),NOT ISCROSSFILTERED(DimDivision) || DimEmployee[division] IN VALUES(DimDivision[divisionName]))))',fmt='#,##0',description='Current roster; does not change with date or project selection.')
for category in ['Training','Internal','Admin','Vacation','Holiday','Productive','Unmapped']:
    m(category+' Hours',f'CALCULATE([Actual Hours],KEEPFILTERS(FactTimesheet[hourCategory]="{category}"))','02 Utilization')
m('Effective Hours','IF(COALESCE([Unmapped Hours],0)=0,[Actual Hours]-COALESCE([Training Hours],0)-COALESCE([Internal Hours],0)-COALESCE([Admin Hours],0)-COALESCE([Vacation Hours],0)-COALESCE([Holiday Hours],0))','02 Utilization')
m('Working Days','COALESCE(CALCULATE(COUNTROWS(DimDate),KEEPFILTERS(DimDate[IsWeekday]=TRUE()),KEEPFILTERS(DimDate[IsHoliday]=FALSE())),0)','02 Utilization','#,##0')
m('Holiday Days','CALCULATE(COUNTROWS(DimDate),KEEPFILTERS(DimDate[IsWeekday]=TRUE()),KEEPFILTERS(DimDate[IsHoliday]=TRUE()))','02 Utilization','#,##0')
m('Roster Capacity Hours','IF(NOT ISCROSSFILTERED(DimProject) && NOT ISCROSSFILTERED(DimTask), [Working Days]*SELECTEDVALUE(Settings[DailyHours],8)*[Active Team Strength])','02 Utilization',description='Current roster estimate. Blank at project/task grain because allocations are unavailable.')
m('Capacity Vacation Hours','''VAR H=SELECTEDVALUE(Settings[DailyHours],8)
VAR A=MAX(Settings[AsOfDate])
VAR People=CALCULATETABLE(VALUES(DimEmployee[id]),KEEPFILTERS(DimEmployee[isActive]=TRUE()),KEEPFILTERS(DimEmployee[role]<>"system admin"),KEEPFILTERS(FILTER(ALL(DimEmployee[division]),NOT ISCROSSFILTERED(DimDivision) || DimEmployee[division] IN VALUES(DimDivision[divisionName]))))
VAR Days=CALCULATETABLE(VALUES(DimDate[Date]),KEEPFILTERS(DimDate[IsWeekday]=TRUE()),KEEPFILTERS(DimDate[IsHoliday]=FALSE()))
RETURN IF(NOT ISCROSSFILTERED(DimProject) && NOT ISCROSSFILTERED(DimTask),SUMX(CROSSJOIN(People,Days),
VAR D=DimDate[Date]
VAR Recorded=CALCULATE(SUM(FactTimesheet[hours]),FactTimesheet[hourCategory]="Vacation",FactTimesheet[status] IN {"submitted","approved"})
VAR Planned=CALCULATE(COUNTROWS(FactVacation))
RETURN MIN(H,IF(D>=A && Planned>0,H,COALESCE(Recorded,0)))))''','02 Utilization',description='Per employee/day capped at daily hours. Future plans supersede recorded leave, preventing double subtraction. Only weekdays excluding holidays.')
m('Vacation Days','DIVIDE([Capacity Vacation Hours],SELECTEDVALUE(Settings[DailyHours],8))','02 Utilization')
m('Available Hours','IF(NOT ISBLANK([Roster Capacity Hours]),MAX(0,[Roster Capacity Hours]-COALESCE([Capacity Vacation Hours],0)))','02 Utilization')
m('Monthly Utilization %','DIVIDE([Effective Hours],[Available Hours])','02 Utilization','0.0%', 'Selected-period utilization using current roster estimate; monthly when grouped/filtered by YearMonth.')
m('Under Utilized %','IF(NOT ISBLANK([Monthly Utilization %]),1-[Monthly Utilization %])','02 Utilization','0.0%')
m('As Of Date','MAX(Settings[AsOfDate])','09 Metadata','yyyy-mm-dd')
m('Last Completed Friday','[As Of Date]-MOD(WEEKDAY([As Of Date],2)-5+6,7)-1','09 Metadata','yyyy-mm-dd')
m('FY Utilization Through Friday %','''VAR E=[Last Completed Friday]
VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1)
VAR S=DATE(YEAR(E)-IF(MONTH(E)<FM,1,0),FM,1)
RETURN CALCULATE(IF(COALESCE([Unmapped Hours],0)=0,DIVIDE([Actual Hours]-COALESCE([Training Hours],0)-COALESCE([Vacation Hours],0)-COALESCE([Holiday Hours],0),[Available Hours])),REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,E))''','02 Utilization','0.0%', 'Workbook annual numerator excludes training but retains internal/admin. Current-roster FY estimate; exact project-start denominator needs allocation history.')
for label,offset in [('Last Week',-7),('Current Week',0),('Next Week',7)]:
    m('Available Hours '+label,f'VAR S=[As Of Date]-WEEKDAY([As Of Date],2)+1+({offset}) RETURN CALCULATE([Available Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,S+6))','03 Capacity')
m('Available Hours FY','VAR A=[As Of Date] VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1) VAR S=DATE(YEAR(A)-IF(MONTH(A)<FM,1,0),FM,1) RETURN CALCULATE([Available Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,EDATE(S,12)-1))','03 Capacity')
for team in ['Dedicated','Flex']:
    filt=f'FILTER(VALUES(DimEmployee[supportingCategory]),CONTAINSSTRING(DimEmployee[supportingCategory],"{team}"))'
    m(team+' Hours',f'CALCULATE([Actual Hours],KEEPFILTERS({filt}))','04 Teams')
    m(team+' Strength',f'CALCULATE([Active Team Strength],KEEPFILTERS({filt}))','04 Teams','#,##0')
    m(team+' Utilization %',f'CALCULATE([Monthly Utilization %],KEEPFILTERS({filt}))','04 Teams','0.0%')
    m(team+' FY Hours',f'VAR E=[Last Completed Friday] VAR FM=SELECTEDVALUE(Settings[FiscalStartMonth],1) VAR S=DATE(YEAR(E)-IF(MONTH(E)<FM,1,0),FM,1) RETURN CALCULATE([{team} Hours],REMOVEFILTERS(DimDate),DATESBETWEEN(DimDate[Date],S,E))','04 Teams')
m('Available Employee Equivalents','IF(NOT ISBLANK([Monthly Utilization %]),DIVIDE(MAX(0,[Available Hours]-[Effective Hours]),SELECTEDVALUE(Settings[DailyHours],8)*[Working Days]))','04 Teams',description='Unused hours converted to full-period employee equivalents; not a named cohort or staff assignment.')

project_scope='KEEPFILTERS(FILTER(ALL(DimProject[division]),NOT ISCROSSFILTERED(DimDivision) || DimProject[division] IN VALUES(DimDivision[divisionName])))'
delivered='FILTER(DimProject,NOT ISBLANK(DimProject[deliveredDate]) && DimProject[deliveredDate] IN VALUES(DimDate[Date]))'
m('Projects Delivered',f'CALCULATE(COUNTROWS({delivered}),{project_scope})','05 Delivery','#,##0')
m('Projects On Time',f'CALCULATE(COUNTROWS(FILTER({delivered},NOT ISBLANK(DimProject[targetDate]) && DimProject[deliveredDate]<=DimProject[targetDate])),{project_scope})','05 Delivery','#,##0')
m('Project On Time %',f'VAR Known=CALCULATE(COUNTROWS(FILTER({delivered},NOT ISBLANK(DimProject[targetDate]))),{project_scope}) RETURN IF(Known=[Projects Delivered],DIVIDE([Projects On Time],Known))','05 Delivery','0.0%')
m('Delivered Project Budget Hours',f'VAR P=CALCULATETABLE({delivered},{project_scope}) RETURN IF(COUNTROWS(P)>0 && COUNTROWS(FILTER(P,ISBLANK(DimProject[budgetHours])))=0,SUMX(P,DimProject[budgetHours]))','05 Delivery')
m('Delivered Project Actual Hours',f'VAR P=CALCULATETABLE(SELECTCOLUMNS({delivered},"ID",DimProject[id]),{project_scope}) RETURN CALCULATE([Actual Hours],REMOVEFILTERS(DimDate),KEEPFILTERS(TREATAS(P,DimProject[id])))','05 Delivery',description='Lifetime actual hours for the same delivered-project cohort as the budget, preventing partial-period vs lifetime-budget comparisons.')
m('Effort Deviation %','IF(NOT ISBLANK([Delivered Project Budget Hours]) && NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),DIVIDE([Delivered Project Actual Hours]-[Delivered Project Budget Hours],[Delivered Project Budget Hours]))','05 Delivery','0.0%')
m('Schedule Deviation Days',f'CALCULATE(AVERAGEX(FILTER({delivered},NOT ISBLANK(DimProject[targetDate])),DATEDIFF(DimProject[targetDate],DimProject[deliveredDate],DAY)),{project_scope})','05 Delivery',description='Mean delivered minus planned target date in calendar days. Positive is late.')
m('Schedule Deviation %',f'CALCULATE(AVERAGEX(FILTER({delivered},NOT ISBLANK(DimProject[startDate]) && DimProject[targetDate]>DimProject[startDate]),DIVIDE(DATEDIFF(DimProject[targetDate],DimProject[deliveredDate],DAY),DATEDIFF(DimProject[startDate],DimProject[targetDate],DAY))),{project_scope})','05 Delivery','0.0%', 'Provisional normalized schedule deviation: days late/early divided by planned elapsed duration.')
m('Effort Alert Color','IF(ISBLANK([Effort Deviation %]),"#64748B",IF(ABS([Effort Deviation %])>0.05,"#DC2626","#0F766E"))','05 Delivery','')
m('Schedule Alert Color','IF(ISBLANK([Schedule Deviation %]),"#64748B",IF(ABS([Schedule Deviation %])>0.03,"#DC2626","#0F766E"))','05 Delivery','')
m('Detail Conflicts',f'CALCULATE(COUNTROWS(FactWeeklyDetails),FactWeeklyDetails[detailConflict]=TRUE(),{project_scope})','08 Quality','#,##0')
for label,col in [('Weekly Fundamental Errors','fundamental_error_count'),('Improvement Log Count','improvement_count'),('Designed','designed'),('Developed','developed')]:
    m(label,f'IF(COALESCE([Detail Conflicts],0)=0,CALCULATE(SUM(FactWeeklyDetails[{col}]),{project_scope}))','08 Quality','#,##0')
for label,col in [('Fundamental Errors','fundamentalErrors'),('Information Errors','informationErrors'),('Readable Errors','readableErrors')]:
    m(label,f'VAR T=CALCULATETABLE(FactDeliverable,{project_scope},KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK())) RETURN IF(COUNTROWS(T)>0 && COUNTROWS(FILTER(T,ISBLANK(FactDeliverable[{col}])))=0,SUMX(T,FactDeliverable[{col}]))','08 Quality','#,##0')
m('Deliverables',f'CALCULATE(DISTINCTCOUNT(FactDeliverable[deliverableId]),{project_scope},KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK()))','08 Quality','#,##0')
m('Defect Density %','DIVIDE([Fundamental Errors],[Deliverables])','08 Quality','0.0%')
m('First Time Right %',f'VAR T=CALCULATETABLE(FactDeliverable,{project_scope},KEEPFILTERS(FactDeliverable[deliveredDate]<>BLANK())) RETURN IF(COUNTROWS(T)>0 && COUNTROWS(FILTER(T,ISBLANK(FactDeliverable[hadRework])))=0,DIVIDE(COUNTROWS(FILTER(T,FactDeliverable[hadRework]=FALSE())),COUNTROWS(T)))','08 Quality','0.0%')
m('On Time Deliverables',f'CALCULATE(COUNTROWS(FILTER(FactDeliverable,NOT ISBLANK(FactDeliverable[deliveredDate]) && NOT ISBLANK(FactDeliverable[plannedDate]) && FactDeliverable[deliveredDate]<=FactDeliverable[plannedDate])),{project_scope})','08 Quality','#,##0')
m('Defect Alert Color','IF(ISBLANK([Defect Density %]),"#64748B",IF(ABS([Defect Density %]-SELECTEDVALUE(Settings[DefectTarget],0))>0.05,"#DC2626","#0F766E"))','08 Quality','')
m('Products Touched',f'VAR IDs=CALCULATETABLE(VALUES(FactTimesheet[projectId]),FactTimesheet[status] IN {{"submitted","approved"}},{division_filter}) RETURN CALCULATE(DISTINCTCOUNT(DimProject[product]),KEEPFILTERS(TREATAS(IDs,DimProject[id])),DimProject[product]<>BLANK())','06 Improvement','#,##0')
m('Additive Manufacturing',f'CALCULATE(DISTINCTCOUNT(FactImprovement[improvementId]),FactImprovement[isAdditiveManufacturing]=TRUE(),{project_scope})','06 Improvement','#,##0')
m('Improvement Initiatives',f'CALCULATE(DISTINCTCOUNT(FactImprovement[improvementId]),{project_scope})','06 Improvement','#,##0')
m('Open Positions','VAR E=MAX(DimDate[Date]) VAR S=DATE(YEAR(E),MONTH(E),1) VAR T=CALCULATETABLE(FactStaffing,REMOVEFILTERS(DimDate),DimDate[Date]=S) RETURN IF(COUNTROWS(T)=COUNTROWS(VALUES(DimDivision[id])) && COUNTROWS(FILTER(T,ISBLANK(FactStaffing[openPositions])))=0,SUMX(T,FactStaffing[openPositions]))','07 Staffing','#,##0','Snapshot for last selected month. Blank if any selected division has no entry.')
m('New Joiners','VAR Months=SELECTCOLUMNS(SUMMARIZE(DimDate,DimDate[YearMonth]),"MonthStart",CALCULATE(DATE(YEAR(MIN(DimDate[Date])),MONTH(MIN(DimDate[Date])),1))) VAR T=CALCULATETABLE(FactStaffing,REMOVEFILTERS(DimDate),TREATAS(Months,DimDate[Date])) RETURN IF(COUNTROWS(T)=COUNTROWS(Months)*COUNTROWS(VALUES(DimDivision[id])) && COUNTROWS(FILTER(T,ISBLANK(FactStaffing[newJoiners])))=0,SUMX(T,FactStaffing[newJoiners]))','07 Staffing','#,##0')
m('Hours Scheduled',f'IF(NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),CALCULATE(SUM(FactPlan[scheduledHours]),{project_scope}))','03 Capacity')
m('Remaining Forecast Hours',f'IF(NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),CALCULATE(SUM(FactPlan[remainingForecastHours]),{project_scope}))','03 Capacity')
m('Team Forecast Hours','VAR A=[As Of Date] RETURN IF(NOT ISCROSSFILTERED(DimEmployee) && NOT ISCROSSFILTERED(DimTask),CALCULATE([Actual Hours],KEEPFILTERS(DimDate[Date]<A))+[Remaining Forecast Hours])','03 Capacity',description='Past actuals plus future remaining budget. Past and future do not overlap.')
m('Overdue Unscheduled Hours',f'VAR A=[As Of Date] RETURN CALCULATE(SUMX(FILTER(DimProject,DimProject[projectStatus]="Inprogress" && NOT ISBLANK(DimProject[targetDate]) && DimProject[targetDate]<A && NOT ISBLANK(DimProject[budgetHours])),MAX(0,DimProject[budgetHours]-CALCULATE([Actual Hours],REMOVEFILTERS(DimDate)))),{project_scope})','03 Capacity')
m('Projects Missing Plan Inputs',f'CALCULATE(COUNTROWS(FILTER(DimProject,DimProject[projectStatus]="Inprogress" && (ISBLANK(DimProject[startDate]) || ISBLANK(DimProject[targetDate]) || ISBLANK(DimProject[budgetHours]) || DimProject[targetDate]<DimProject[startDate]))),{project_scope})','03 Capacity','#,##0')
m('Report Status','IF(ISBLANK([Last Refresh IST]),"API refresh required","Refreshed " & [Last Refresh IST]) & " • see Input readiness for missing source contracts"','09 Metadata','')
m('Last Refresh IST','SELECTEDVALUE(Settings[RefreshIST])','09 Metadata','')
table('_Measures',[('Label','string')],'#table(type table [Label=text],{{"GCC requirements"}})')
tables[-1]['columns'][0]['isHidden']=True
tables[-1]['measures']=measures
model=dict(name='GCC Requirements',compatibilityLevel=1606,model=dict(culture='en-US',defaultPowerBIDataSourceVersion='powerBI_V3',sourceQueryCulture='en-US',tables=tables,relationships=relationships,expressions=expressions,annotations=[dict(name='__PBI_TimeIntelligenceEnabled',value='0')]))
write(MODEL/'model.bim',model)
write(MODEL/'definition.pbism',{'$schema':'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json','version':'1.0','settings':{}})
write(OUT/'GCC_Requirements.pbip',{'$schema':'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json','version':'1.0','artifacts':[{'report':{'path':'GCC_Requirements.Report'}}],'settings':{'enableAutoRecovery':True}})
write(REPORT/'definition.pbir',{'$schema':'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json','version':'4.0','datasetReference':{'byPath':{'path':'../GCC_Requirements.SemanticModel'}}})
write(REPORT/'definition/version.json',{'$schema':SCHEMA+'versionMetadata/1.0.0/schema.json','version':'2.0.0'})
write(REPORT/'definition/report.json',{'$schema':SCHEMA+'report/1.0.0/schema.json','themeCollection':{},'layoutOptimization':'None'})

def lit(v):
    return {'expr':{'Literal':{'Value':"'"+v.replace("'","''")+"'" if isinstance(v,str) else 'true' if v is True else 'false' if v is False else str(v)+'D'}}}
def color(v): return {'solid':{'color':lit(v)}}
def field(t,c):
    kind='Measure' if t=='_Measures' else 'Column'
    return {'field':{kind:{'Expression':{'SourceRef':{'Entity':t}},'Property':c}},'queryRef':t+'.'+c,'nativeQueryRef':c}
def C(t,c): return (t,c)
def M(c): return ('_Measures',c)

pages=[]
visual_count=0
def page(name,title,note,filters=True):
    global current, vindex
    current=name; vindex=0;pages.append(name)
    write(REPORT/f'definition/pages/{name}/page.json',{'$schema':SCHEMA+'page/1.0.0/schema.json','name':name,'displayName':title,'displayOption':'FitToPage','width':1440,'height':900,'objects':{'background':[{'properties':{'color':color('#F1F5F9'),'transparency':lit(0)}}]}})
    textbox(title,24,18,1360,45,28,'#0F172A')
    textbox(note,24,68,1360,44,12,'#475569')
    if filters:
        visual('slicer','Period • select a month',24,118,440,78,{'Values':[C('DimDate','YearMonth')]})
        visual('slicer','Division',480,118,440,78,{'Values':[C('DimDivision','divisionName')]})
        if name in ['02_utilization','05_teams','08_detail']:
            visual('slicer','Dedicated / Flex',936,118,480,78,{'Values':[C('DimEmployee','supportingCategory')]})
        else:
            visual('slicer','Fiscal year • start-year label',936,118,480,78,{'Values':[C('DimDate','FiscalYear')]})
def put(config,x,y,w,h):
    global vindex,visual_count
    vindex+=1;visual_count+=1; name=f'{current}_{vindex:02}'
    doc={'$schema':SCHEMA+'visualContainer/2.1.0/schema.json','name':name,'position':{'x':x,'y':y,'width':w,'height':h,'z':vindex,'tabOrder':vindex},'visual':config}
    if config.get('visualType')=='slicer' and config['query']['queryState']['Values']['projections'][0]['queryRef']=='DimDate.YearMonth':
        # Normal saved slicer selection; users can select any month or clear it for trends.
        month=datetime.date.today().strftime('%Y-%m')
        selected_month={'Version':2,'From':[{'Name':'d','Entity':'DimDate','Type':0}],'Where':[{'Condition':{'In':{'Expressions':[{'Column':{'Expression':{'SourceRef':{'Source':'d'}},'Property':'YearMonth'}}],'Values':[[{'Literal':{'Value':"'"+month+"'"}}]]}}}]}
        config.setdefault('objects',{})['general']=[{'properties':{'filter':{'filter':selected_month}}}]
    write(REPORT/f'definition/pages/{current}/visuals/{name}/visual.json',doc)
def textbox(text,x,y,w,h,size=13,fg='#475569'):
    put({'visualType':'textbox','objects':{'general':[{'properties':{'paragraphs':[{'textRuns':[{'value':text,'textStyle':{'fontFamily':'Segoe UI','fontSize':str(size)+'pt','color':fg}}]}]}}]}},x,y,w,h)
def visual(kind,title,x,y,w,h,roles,alert=None):
    config={'visualType':kind,'query':{'queryState':{role:{'projections':[field(*f) for f in fs]} for role,fs in roles.items()}},'visualContainerObjects':{'title':[{'properties':{'show':lit(True),'text':lit(title),'fontSize':lit(13),'fontColor':color('#0F172A')}}],'background':[{'properties':{'show':lit(True),'color':color('#FFFFFF'),'transparency':lit(0)}}],'border':[{'properties':{'show':lit(True),'color':color('#E2E8F0'),'radius':lit(8)}}]},'drillFilterOtherVisuals':True}
    if kind=='slicer':config['objects']={'data':[{'properties':{'mode':lit('Dropdown')}}]}
    if kind=='card':config['objects']={'categoryLabels':[{'properties':{'show':lit(False)}}],'labels':[{'properties':{'fontSize':lit(26)}}]}
    if kind=='tableEx':config['objects']={'values':[{'properties':{'fontSize':lit(11),'wordWrap':lit(True)}}],'columnHeaders':[{'properties':{'fontSize':lit(11),'wordWrap':lit(True)}}],'grid':[{'properties':{'rowPadding':lit(6)}}]}
    if alert:config['objects']['labels'][0]['properties']['color']={'solid':{'color':{'expr':{'Measure':{'Expression':{'SourceRef':{'Entity':'_Measures'}},'Property':alert}}}}}
    put(config,x,y,w,h)
def cards(names,y=214):
    width=(1392-16*(len(names)-1))/len(names)
    for i,item in enumerate(names):
        title,measure_name,alert=(item if isinstance(item,tuple) else (item,item,None))
        visual('card',title,24+i*(width+16),y,width,116,{'Values':[M(measure_name)]},alert)
def chart(title,category,metrics,x=24,y=350,w=688,h=244,kind='clusteredColumnChart'):
    visual(kind,title,x,y,w,h,{'Category':[category],'Y':[M(n) for n in metrics]})
def grid(title,cols,x=24,y=614,w=1392,h=262):
    visual('tableEx',title,x,y,w,h,{'Values':cols})

page('01_overview','GCC | Performance overview','Select a reporting month. Capacity uses the current roster. Delivery cards count projects; quality cards require a deliverable register.')
cards(['Actual Hours','Monthly Utilization %','Active Team Strength','Project On Time %'])
chart('Actual hours by month',C('DimDate','YearMonth'),['Actual Hours','Training Hours'])
chart('Delivery and workload by division',C('DimDivision','divisionName'),['Actual Hours'],x=728)
grid('Performance by division',[C('DimDivision','divisionName'),M('Actual Hours'),M('Monthly Utilization %'),M('Under Utilized %'),M('Projects Delivered'),M('Products Touched')])
page('02_utilization','GCC | Utilization','Monthly: effective work / available hours. Annual: work less training and leave through last completed Friday. Both use current-roster estimates.')
cards(['Monthly Utilization %','FY Utilization Through Friday %','Under Utilized %','Unmapped Hours'])
chart('Monthly utilization',C('DimDate','YearMonth'),['Monthly Utilization %','Under Utilized %'],kind='lineChart')
chart('Hours by task category',C('DimTask','taskCategory'),['Actual Hours'],x=728)
grid('Capacity and exclusions',[C('DimEmployee','department'),M('Active Team Strength'),M('Working Days'),M('Holiday Days'),M('Vacation Days'),M('Available Hours'),M('Training Hours'),M('Internal Hours'),M('Admin Hours')])
page('03_delivery','GCC | Delivery & quality','Effort compares lifetime work with lifetime budget for projects delivered in the selected period. Gray quality cards mean the deliverable source is missing.')
cards([('Effort deviation','Effort Deviation %','Effort Alert Color'),('Schedule deviation','Schedule Deviation %','Schedule Alert Color'),('Defect density','Defect Density %','Defect Alert Color'),('First time right','First Time Right %',None)])
chart('Project deliveries by month',C('DimDate','YearMonth'),['Projects Delivered','Projects On Time'])
chart('Weekly quality and improvements',C('DimDate','WeekStart'),['Weekly Fundamental Errors','Improvement Log Count'],x=728)
grid('Project delivery detail',[C('DimProject','projectCode'),C('DimProject','projectName'),C('DimProject','targetDate'),C('DimProject','deliveredDate'),M('Delivered Project Budget Hours'),M('Delivered Project Actual Hours'),M('Schedule Deviation Days')])
page('04_capacity','GCC | Capacity & forecast','Forecast is an estimate from remaining project budgets spread over future working dates. Department/team demand needs resource allocations; clear the team filter.')
cards(['Available Hours Last Week','Available Hours Current Week','Available Hours Next Week','Overdue Unscheduled Hours'])
chart('Actuals plus future demand',C('DimDate','WeekStart'),['Team Forecast Hours','Hours Scheduled','Available Hours'],w=920,kind='lineChart')
visual('card','Projects missing planning inputs',960,350,456,244,{'Values':[M('Projects Missing Plan Inputs')]})
grid('Project planning inputs',[C('DimProject','projectCode'),C('DimProject','projectStatus'),C('DimProject','startDate'),C('DimProject','targetDate'),C('DimProject','budgetHours'),M('Hours Scheduled'),M('Remaining Forecast Hours')])
page('05_teams','GCC | Dedicated & Flex teams','Team type comes from each employee’s supporting category. Strength is the current roster; contributing employees have submitted or approved work in the selected period.')
cards(['Dedicated Strength','Flex Strength','Dedicated FY Hours','Flex FY Hours'])
chart('Dedicated / Flex hours',C('DimDate','YearMonth'),['Dedicated Hours','Flex Hours'])
chart('Flex utilization through the year',C('DimDate','YearMonth'),['Flex Utilization %'],x=728,kind='lineChart')
grid('Department capacity',[C('DimEmployee','department'),M('Flex Strength'),M('Contributing Employees'),M('Actual Hours'),M('Monthly Utilization %'),M('Available Employee Equivalents')])
page('06_improvement','GCC | Continuous improvement','Weekly counts are deduplicated and attributed to Monday. VAVE / Automation / COE / cost optimization and additive manufacturing need the improvement register.')
cards(['Products Touched','Improvement Log Count','Designed','Developed'])
chart('Improvement activity by week',C('DimDate','WeekStart'),['Improvement Log Count','Designed','Developed'])
chart('Initiatives by category • source pending',C('FactImprovement','category'),['Improvement Initiatives'],x=728)
grid('Weekly improvement details',[C('FactWeeklyDetails','date'),C('DimProject','projectCode'),C('FactWeeklyDetails','item_number'),C('FactWeeklyDetails','improvement_location'),M('Improvement Log Count'),M('Weekly Fundamental Errors'),M('Detail Conflicts')])
page('07_staffing','GCC | Staffing','Open positions are the last selected month’s snapshot. New joiners are summed across selected months. Missing division/month submissions remain blank.')
cards(['Open Positions','New Joiners','Active Team Strength','Contributing Employees'])
chart('Monthly open positions',C('DimDate','YearMonth'),['Open Positions'])
chart('Monthly new joiners',C('DimDate','YearMonth'),['New Joiners'],x=728)
grid('Staffing submissions',[C('FactStaffing','date'),C('FactStaffing','division'),C('FactStaffing','openPositions'),C('FactStaffing','newJoiners')])
page('08_detail','GCC | Timesheet & training detail','Actual measures use submitted and approved records. This detailed table also exposes draft/rejected rows for reconciliation; filter status as needed.')
cards(['Actual Hours','Approved Hours','Training Hours','Detail Conflicts'])
grid('Timesheet detail',[C('FactTimesheet','id'),C('FactTimesheet','date'),C('DimEmployee','employeeName'),C('DimEmployee','department'),C('DimProject','projectCode'),C('DimTask','taskCategory'),C('FactTimesheet','status'),M('Raw Hours')],y=350,h=526)
page('09_inputs','GCC | Input readiness','Definitions needing confirmation and missing source contracts are visible here. No production records or credentials are included in the saved project.',False)
grid('Requirements coverage',[C('InputStatus','Requirement'),C('InputStatus','Status'),C('InputStatus','Definition')],y=140,h=584)
grid('Refresh settings',[C('Settings','FiscalStartMonth'),C('Settings','DailyHours'),C('Settings','DefectTarget'),C('Settings','AsOfDate'),C('Settings','RefreshIST')],y=744,h=132)
write(REPORT/'definition/pages/pages.json',{'$schema':SCHEMA+'pagesMetadata/1.0.0/schema.json','pageOrder':pages,'activePageName':pages[0]})
(OUT/'.gitignore').write_text('.pbi/\n',encoding='utf-8')
write(ROOT/'validation/build-summary.json',{'tables':len(tables),'measures':len(measures),'relationships':len(relationships),'pages':len(pages),'visuals':visual_count,'source':'PowerPi Requirments.xlsx / Sheet1','liveRefresh':'Not completed; URL and reporting credentials required.'})
print(f'Built {OUT}: {len(tables)} tables, {len(measures)} measures, {len(pages)} pages, {visual_count} visuals')
