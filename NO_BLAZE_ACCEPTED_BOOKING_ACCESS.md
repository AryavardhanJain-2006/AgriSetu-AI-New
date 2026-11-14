# Accepted-booking monitoring and AI-report access

This deployment uses Firebase Authentication and Realtime Database Security Rules. The accepted-booking flow does not require Cloud Functions or a Firebase Blaze upgrade.

For the separate new Firebase project, follow `NEW_PROJECT_SETUP_GUIDE.md`. A farmer booking is synchronized under `/storageBookings/{facilityId}/{bookingId}`. When the assigned Cold Storage operator accepts it, the application updates the booking and creates `/monitoringAccess/{farmerUid}/facilityIds/{facilityId}`. AI reports for a verified accepted booking are stored in the farmer's private report list and in `/facilityAIReports/{facilityId}/{reportId}` for the assigned facility. Unbooked produce reports are private to the farmer.

The operator can read reports only for the facility assigned in its `/userAccess/{uid}` record. Do not loosen the database rules or enable public read/write.
