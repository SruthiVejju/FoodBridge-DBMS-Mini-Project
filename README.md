# FoodBridge
## Food Waste Redistribution and Resource Allocation System

**DBMS Mini Project**

### Team Members
- Sruthi Vejju - PES1UG24CS472
- Shubashitha Gowtham - PES1UG24CS450

### Project Overview
FoodBridge connects food donors with NGOs to help redistribute surplus food. Donors publish available food, NGOs request food, and the system manages allocations, pickups, and delivery confirmation.

### Technologies
- Next.js, TypeScript
- PostgreSQL with pgvector
- MongoDB
- Machine learning-based semantic matching
- Docker

### Features
- Donor and NGO registration and login
- Food donation and NGO request management
- Semantic matching using text embeddings
- Food allocation and pickup tracking
- NGO delivery confirmation
- MongoDB activity and food-condition records
- Advanced SQL features and transaction testing

### Database
The final database follows Third Normal Form (3NF).

- 6 PostgreSQL tables
- 54 attributes
- 6 primary keys
- 6 foreign keys

Database scripts are in `database/`.
ER and relational schema diagrams are in `diagrams/`.

### Running the Application
1. Install Node.js and Docker Desktop.
2. Start PostgreSQL and MongoDB using the project's database configuration.
3. Run `npm install`.
4. Configure `.env.local` using the project's environment settings.
5. Run `npm run dev`.
6. Open http://localhost:3000.

### Testing
Database test scripts and concurrency test code are included in the repository.
