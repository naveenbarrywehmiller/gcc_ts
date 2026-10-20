# SharePoint Integration Clarification

This document provides full details on what the "SharePoint Integration" actually means for your Timesheet Web Application, how it impacts the user interface, and where your data lives.

## 1. The User Interface (UI) Remains Custom

**Your web application does NOT look like SharePoint.** 

The front-end of the application (what your employees, managers, and admins see) remains the exact same modern, custom-built React application. 
- It retains the dark/light mode themes.
- It retains the custom calendar grids, dynamic dropdowns, and responsive mobile views.
- Your employees will navigate to a standard web URL (e.g., `http://localhost:5173` or your company's internal URL) just as they would for any standalone web app.
- They will *not* log into the SharePoint web portal to submit their timesheets.

## 2. Where Does the Data Go? (The Dual-Write System)

The SharePoint integration is entirely a **back-end** feature. We have implemented what is known as a "Dual-Write" system.

### Step 1: The Primary Database (SQLite)
When an employee clicks "Save" or "Submit" in the React web application, the data is instantly saved to the application's local **SQLite database**. This ensures the application remains lightning-fast and can operate even if Microsoft's servers are temporarily down. SQLite remains the single source of truth for the web app.

### Step 2: The Secondary Database (SharePoint Lists)
Immediately after saving to SQLite, the server automatically connects to Microsoft 365 in the background (using Microsoft Graph/REST APIs) and pushes a copy of that exact same data into **SharePoint Lists**. 

If you were to log into the Microsoft SharePoint Admin Center and view these lists, they would look like giant Excel spreadsheets containing all the timesheet records, projects, and user information.

## 3. Why Use SharePoint if we have SQLite?

If the web app already has a database (SQLite), why are we also sending data to SharePoint? 

Because the Microsoft 365 ecosystem is deeply interconnected. By mirroring the data into SharePoint, we unlock powerful enterprise features without having to write custom code for them:

1. **Power Automate (Workflows):** Power Automate can easily watch SharePoint Lists. When it sees a timesheet status change to "Submitted", it can automatically send an interactive Adaptive Card to a manager's Microsoft Teams chat or Outlook email, allowing them to click "Approve" right from their chat window.
2. **Power BI (Reporting):** Power BI has native connectors for SharePoint Lists. Your data analysts can open Power BI, connect it straight to the SharePoint List, and instantly build real-time dashboards for executives. 
3. **Data Redundancy:** You have an automatic, cloud-backed copy of all your company's timesheet data living securely in Microsoft's servers.

## 4. Can I Test the App Without SharePoint?

**Yes.** The SharePoint integration is optional and gated behind a feature flag. 

If you open the `server/.env` file and set `ENABLE_SHAREPOINT_SYNC=false`, the application will skip "Step 2" mentioned above. It will save the data to the local SQLite database and stop there. 

This means you can fully test the web application, approve timesheets, and manage projects locally right now, without needing any SharePoint Administrator permissions. Once your IT department grants you the necessary permissions to create the SharePoint site and lists, you simply flip the flag to `true`, and the application will seamlessly begin mirroring new data to the cloud.
